import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { migrateProject } from '../services/migrations';
import { repairProject } from './integrity';
import { removeNodes } from './operations';
import { mergeProject } from './projectMerge';
import { publicationSnapshot } from './publication';
import {
  addRows,
  cellError,
  dataTable,
  dataTables,
  duplicateRows,
  normalizeCell,
  parseGrid,
  pasteCells,
  rowsOf,
  setCell,
  tableRowIssues,
  type CellValue,
} from './tableData';
import type { Project } from './types';

const column = (p: Project, nodeId: string, key: string) => dataTable(p, nodeId)!.columns.find(c => c.key === key)!;
/** Añade una fila con esas celdas (y sus IDENTITY numeradas). */
function withRow(p: Project, nodeId: string, id: string, cells: Record<string, CellValue>) {
  let next = addRows(p, nodeId, [id]);
  Object.entries(cells).forEach(([key, value]) => (next = setCell(next, nodeId, id, key, value)));
  return next;
}
const issuesOf = (p: Project, nodeId: string) => {
  const issues = tableRowIssues(p, dataTable(p, nodeId)!);
  return Object.fromEntries([...issues].map(([row, cells]) => [row, Object.fromEntries(cells)]));
};

describe('filas de las tablas', () => {
  it('las columnas son las del script, con su clave foránea (también compuesta)', () => {
    const p = commercialCase();
    const linea = dataTable(p, 'n-linea')!;
    expect(linea.columns.map(c => c.key)).toEqual(['linea_pedido', 'numero', 'linea_producto', 'cantidad']);
    expect(linea.columns[0].fk).toEqual({ nodeId: 'n-pedido', key: 'pedido_id' });
    const devolucion = dataTable(p, 'n-devolucion')!;
    expect(devolucion.columns.filter(c => c.fk).map(c => [c.key, c.fk!.key])).toEqual([
      ['devuelta:linea_pedido', 'linea_pedido'],
      ['devuelta:numero', 'numero'],
    ]);
    expect(dataTables(p)).toHaveLength(8);
  });

  it('normaliza lo que se escribe o se pega', () => {
    const p = commercialCase();
    const precio = column(p, 'n-producto', 'precio');
    expect(normalizeCell(precio, '1.234,56')).toBe('1234.56');
    expect(normalizeCell(precio, '12,5')).toBe('12.5');
    expect(normalizeCell(precio, ' 7 ')).toBe('7');
    expect(normalizeCell(column(p, 'n-pedido', 'fecha'), '31/12/2026')).toBe('2026-12-31');
    expect(normalizeCell(column(p, 'n-cliente', 'cliente_nombre'), '')).toBeNull();
  });

  it('comprueba el tipo de cada celda', () => {
    const p = commercialCase();
    const precio = column(p, 'n-producto', 'precio');
    expect(cellError(precio, '12345678.9')).toBeNull();
    expect(cellError(precio, '123.456')).toMatch(/2 decimales/);
    expect(cellError(precio, '123456789')).toMatch(/8 cifras enteras/);
    expect(cellError(precio, 'mucho')).toMatch(/número/);
    expect(cellError(column(p, 'n-cliente', 'cliente_id'), '3000000000')).toMatch(/rango de int/);
    expect(cellError(column(p, 'n-producto', 'sku'), 'x'.repeat(21))).toMatch(/20 caracteres/);
    expect(cellError(column(p, 'n-pedido', 'estado'), 'Raro')).toMatch(/Abierto, Enviado, Cerrado/);
    expect(cellError(column(p, 'n-pedido', 'fecha'), '2026-02-30')).toMatch(/fecha/);
    expect(cellError(column(p, 'n-pedido', 'fecha'), '2026-02-28')).toBeNull();
  });

  it('numera las IDENTITY al añadir y al duplicar', () => {
    let p = addRows(commercialCase(), 'n-cliente', ['a', 'b']);
    expect(rowsOf(p, 'n-cliente').map(r => r.cells.cliente_id)).toEqual(['1', '2']);
    p = setCell(p, 'n-cliente', 'b', 'cliente_nombre', 'Bea');
    p = duplicateRows(p, 'n-cliente', ['a']).project;
    expect(rowsOf(p, 'n-cliente').map(r => r.cells.cliente_id)).toEqual(['1', '3', '2']);
    p = addRows(p, 'n-cliente', ['c'], 'a');
    expect(rowsOf(p, 'n-cliente')[1].id).toBe('c');
  });

  it('valida obligatorias, claves, UNIQUE y claves foráneas', () => {
    let p = commercialCase();
    p = withRow(p, 'n-cliente', 'c1', { cliente_nombre: 'Ana', cliente_email: 'a@x.es' });
    p = withRow(p, 'n-cliente', 'c2', { cliente_email: 'a@x.es' });
    p = setCell(p, 'n-cliente', 'c2', 'cliente_id', '1');
    expect(issuesOf(p, 'n-cliente')).toEqual({
      c2: {
        cliente_id: 'Clave repetida: ya está en la fila 1.',
        cliente_nombre: 'No admite nulos.',
        cliente_email: 'Repetido (es único): ya está en la fila 1.',
      },
    });

    // En SQL Server, una UNIQUE admite un solo NULL.
    const nulls = withRow(withRow(p, 'n-cliente', 'c3', { cliente_nombre: 'Eva' }), 'n-cliente', 'c4', {
      cliente_nombre: 'Leo',
    });
    expect(issuesOf(nulls, 'n-cliente').c4).toEqual({
      cliente_email: 'Repetido (es único): ya está en la fila 3 (en SQL Server, NULL solo cabe una vez).',
    });

    // La fecha tiene valor por defecto: puede quedar vacía. El cliente 9 no existe.
    p = withRow(p, 'n-pedido', 'p1', { pedido_cliente: '1', estado: 'Abierto' });
    p = withRow(p, 'n-pedido', 'p2', { pedido_cliente: '9', estado: 'Abierto' });
    expect(issuesOf(p, 'n-pedido')).toEqual({
      p2: { pedido_cliente: 'No hay ninguna fila en «Cliente» con esa clave.' },
    });

    // Clave compuesta: la devolución apunta a (pedido, número) de una línea.
    p = withRow(p, 'n-producto', 'pr1', { sku: 'A1', precio: '10' });
    p = withRow(p, 'n-linea', 'l1', { linea_pedido: '1', numero: '1', linea_producto: '1', cantidad: '2' });
    p = withRow(p, 'n-devolucion', 'd1', { 'devuelta:linea_pedido': '1', 'devuelta:numero': '1' });
    p = withRow(p, 'n-devolucion', 'd2', { 'devuelta:linea_pedido': '1', 'devuelta:numero': '2' });
    expect(Object.keys(issuesOf(p, 'n-devolucion'))).toEqual(['d2']);
    expect(issuesOf(p, 'n-linea')).toEqual({});
  });

  it('pega una rejilla de una hoja de cálculo y crea las filas que faltan', () => {
    let p = addRows(commercialCase(), 'n-producto', ['x']);
    const grid = parseGrid('A1\t10,5\r\nB2\t"1.200,00"\r\nC3\t3\r\n');
    expect(grid).toEqual([
      ['A1', '10,5'],
      ['B2', '1.200,00'],
      ['C3', '3'],
    ]);
    p = pasteCells(p, 'n-producto', 'x', 'sku', grid).project;
    const rows = rowsOf(p, 'n-producto');
    expect(rows.map(r => [r.cells.producto_id, r.cells.sku, r.cells.precio])).toEqual([
      ['1', 'A1', '10.5'],
      ['2', 'B2', '1200.00'],
      ['3', 'C3', '3'],
    ]);
    expect(parseGrid('a;"b;c"\n1;2')).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
  });

  it('se borran con su tabla, no se publican y se conservan al guardar y fusionar', () => {
    const p = withRow(commercialCase(), 'n-cliente', 'c1', { cliente_nombre: 'Ana' });
    expect(removeNodes(p, new Set(['n-cliente'])).tableData).toEqual({});
    expect(publicationSnapshot(p, { excludedTypeIds: [], notes: true, images: true }).tableData).toEqual({});

    const stale = { ...p, tableData: { ...p.tableData, 'n-nada': { rows: [{ id: 'r', cells: {} }] } } };
    const repaired = repairProject(stale);
    expect(Object.keys(repaired.project.tableData)).toEqual(['n-cliente']);

    const saved = JSON.parse(JSON.stringify({ ...p, sqlQueries: [{ id: 'q', name: 'Todos', sql: 'SELECT 1' }] }));
    const loaded = migrateProject(saved);
    expect(loaded.tableData).toEqual(p.tableData);
    expect(loaded.sqlQueries).toEqual([{ id: 'q', name: 'Todos', sql: 'SELECT 1' }]);
    expect(migrateProject({ ...saved, tableData: 'roto', sqlQueries: [{ id: 1 }] }).tableData).toEqual({});

    const merged = mergeProject(commercialCase(), loaded, { schema: true }).project;
    expect(rowsOf(merged, 'n-cliente')).toHaveLength(1);
    expect(merged.sqlQueries).toHaveLength(1);
  });
});
