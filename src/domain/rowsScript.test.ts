import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { db2Script, db2Sources } from './db2Script';
import { sqlScript } from './sqlScript';
import { addRows, setCell, type CellValue } from './tableData';
import type { Project } from './types';

function withRow(p: Project, nodeId: string, id: string, cells: Record<string, CellValue>) {
  let next = addRows(p, nodeId, [id]);
  Object.entries(cells).forEach(([key, value]) => (next = setCell(next, nodeId, id, key, value)));
  return next;
}

function shop(p = commercialCase()) {
  p = withRow(p, 'n-cliente', 'c1', { cliente_nombre: "D'Ana", cliente_email: 'ana@x.es' });
  p = withRow(p, 'n-cliente', 'c2', {});
  p = withRow(p, 'n-pedido', 'p1', { pedido_cliente: '1', estado: 'Abierto' });
  p = withRow(p, 'n-producto', 'pr1', { sku: 'A1', precio: '10,5' });
  return p;
}

/** El mismo caso con las tablas en Db2 for i. */
const db2 = (p: Project): Project => ({
  ...p,
  schemas: p.schemas.map(s => (s.table ? { ...s, dbEngine: 'db2i' } : s)),
});

describe('filas de ejemplo en los scripts', () => {
  it('SQL Server: INSERT antes de las claves foráneas, con IDENTITY_INSERT', () => {
    const script = sqlScript(shop(), new Date('2026-10-23'));
    const insert = script.indexOf('-- Filas de ejemplo');
    expect(insert).toBeGreaterThan(script.lastIndexOf('CREATE TABLE'));
    expect(insert).toBeLessThan(script.indexOf('-- Claves foráneas'));
    expect(script).toContain(
      [
        '-- [dbo].[Cliente]: 2 filas',
        'SET IDENTITY_INSERT [dbo].[Cliente] ON;',
        "INSERT INTO [dbo].[Cliente] ([cliente_id], [cliente_nombre], [cliente_email]) VALUES (1, N'D''Ana', N'ana@x.es');",
        'SET IDENTITY_INSERT [dbo].[Cliente] OFF;',
        '-- Fila 2 omitida. cliente_nombre: No admite nulos.',
      ].join('\n'),
    );
    // La fecha tiene DEFAULT: no se escribe y la base pone la suya.
    expect(script).toContain(
      "INSERT INTO [dbo].[Pedido] ([pedido_id], [pedido_cliente], [estado]) VALUES (1, 1, N'Abierto');",
    );
    expect(script).toContain("INSERT INTO [dbo].[Producto] ([producto_id], [sku], [precio]) VALUES (1, N'A1', 10.5);");
    expect(sqlScript(commercialCase())).not.toContain('Filas de ejemplo');
  });

  it('Db2 for i: OVERRIDING SYSTEM VALUE y la identidad reiniciada', () => {
    const p = db2(shop());
    const script = db2Script(p, new Date('2026-10-23'));
    expect(script).toContain(
      `INSERT INTO CLIENTE (CLIENTE_ID, CLIENTE_NOMBRE, CLIENTE_EMAIL) OVERRIDING SYSTEM VALUE VALUES (1, 'D''Ana', 'ana@x.es');`,
    );
    // La fila 2 tiene errores y no se inserta, pero su número ya está dado: se reinicia detrás.
    expect(script).toContain('ALTER TABLE CLIENTE ALTER COLUMN CLIENTE_ID RESTART WITH 3;');
    expect(script.indexOf('-- Filas de ejemplo')).toBeLessThan(script.indexOf('-- Claves foráneas'));
    expect(db2Script(p, new Date(), { rows: false })).not.toContain('Filas de ejemplo');
  });

  it('Db2 for i: el miembro DATOS se ejecuta antes de las claves, también con DDS', () => {
    const p = db2(shop());
    const files = db2Sources(p, new Date('2026-10-23'), { sql: true, dds: true });
    const flat = (text: string) => text.replace(/\r\n\s*/g, ' ');
    const datos = files.find(f => f.path === 'QSQLSRC/DATOS.sql')!;
    expect(flat(datos.text)).toContain('OVERRIDING SYSTEM VALUE VALUES');
    const crtsql = files.find(f => f.path === 'QCLSRC/CRTSQL.clle')!.text;
    expect(crtsql.indexOf('SRCMBR(DATOS)')).toBeLessThan(crtsql.indexOf('SRCMBR(CLAVES)'));
    expect(crtsql).not.toContain('DATOSPF');
    // En DDS no hay IDENTITY: los números van tal cual, con los nombres de sistema.
    const datospf = files.find(f => f.path === 'QSQLSRC/DATOSPF.sql')!.text;
    expect(flat(datospf)).toContain('INSERT INTO CLIENTE (CLIENTE_ID, CLIENTENOM, ');
    expect(flat(datospf)).toContain("VALUES (1, 'D''Ana', 'ana@x.es');");
    expect(datospf).not.toContain('OVERRIDING');
    const crtdds = files.find(f => f.path === 'QCLSRC/CRTDDS.clle')!.text;
    expect(crtdds.indexOf('SRCMBR(DATOSPF)')).toBeGreaterThan(crtdds.lastIndexOf('CRTPF'));
    expect(crtdds.indexOf('SRCMBR(DATOSPF)')).toBeLessThan(crtdds.indexOf('ADDPFCST'));
    // Los miembros fuente no pasan de 80 columnas (CARGAR.sql va al IFS, no a un archivo fuente).
    const members = files.filter(f => f.path !== 'CARGAR.sql');
    const long = members.flatMap(f =>
      f.text
        .split('\r\n')
        .filter(line => line.length > 80)
        .map(l => `${f.path}: ${l}`),
    );
    expect(long).toEqual([]);
  });
});
