import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { runQuery } from '../services/sqlRunner';
import { queryError, querySetup, resultCsv, translateQuery } from './sqlQuery';
import { addRows, setCell, type CellValue } from './tableData';
import type { Project } from './types';

function withRow(p: Project, nodeId: string, id: string, cells: Record<string, CellValue>) {
  let next = addRows(p, nodeId, [id]);
  Object.entries(cells).forEach(([key, value]) => (next = setCell(next, nodeId, id, key, value)));
  return next;
}

function shop() {
  let p = commercialCase();
  p = withRow(p, 'n-cliente', 'c1', { cliente_nombre: 'Ana' });
  p = withRow(p, 'n-cliente', 'c2', { cliente_nombre: 'Bruno' });
  p = withRow(p, 'n-pedido', 'p1', { pedido_cliente: '1', estado: 'Abierto', fecha: '2026-10-01' });
  p = withRow(p, 'n-pedido', 'p2', { pedido_cliente: '1', estado: 'Cerrado', fecha: '2026-10-02' });
  p = withRow(p, 'n-pedido', 'p3', { pedido_cliente: '2', estado: 'Abierto', fecha: '2026-10-03' });
  p = withRow(p, 'n-producto', 'pr1', { sku: 'A1', precio: '1.234,50' });
  return p;
}

describe('consultas sobre las filas', () => {
  it('solo admite consultas que leen', () => {
    expect(queryError('SELECT * FROM Cliente')).toBeNull();
    expect(queryError('  with x as (select 1) select * from x;')).toBeNull();
    expect(queryError("SELECT 'DELETE' AS texto -- DROP")).toBeNull();
    expect(queryError('DELETE FROM Cliente')).toMatch(/solo se consultan/);
    expect(queryError('SELECT 1; DROP TABLE Cliente')).toMatch(/solo se consultan/);
    expect(queryError(' ; ')).toMatch(/Escribe una consulta/);
  });

  it('traduce lo habitual de SQL Server y de Db2', () => {
    expect(translateQuery('SELECT TOP 5 * FROM [dbo].[Cliente] ORDER BY 1')).toBe(
      'SELECT * FROM [Cliente] ORDER BY 1 LIMIT 5',
    );
    expect(translateQuery('SELECT DISTINCT TOP (2) a FROM t;')).toBe('SELECT DISTINCT a FROM t LIMIT 2;');
    expect(translateQuery('SELECT * FROM TIENDA.CLIENTE FETCH FIRST 3 ROWS ONLY', ['TIENDA'])).toBe(
      'SELECT * FROM CLIENTE LIMIT 3',
    );
    expect(translateQuery('SELECT * FROM t ORDER BY a OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY')).toBe(
      'SELECT * FROM t ORDER BY a LIMIT 5 OFFSET 10',
    );
    expect(translateQuery("SELECT ISNULL(a, 'GETDATE()'), GETDATE(), CURRENT DATE, LEN(b) FROM t")).toBe(
      "SELECT IFNULL(a, 'GETDATE()'), CURRENT_TIMESTAMP, CURRENT_DATE, LENGTH(b) FROM t",
    );
  });

  it('ejecuta en SQLite con las tablas del proyecto', async () => {
    const SQL = await initSqlJs();
    const p = shop();
    const setup = querySetup(p);
    const sql = translateQuery(`
      SELECT TOP 10 c.cliente_nombre AS nombre, COUNT(*) AS pedidos
      FROM dbo.Pedido p JOIN [Cliente] c ON c.cliente_id = p.pedido_cliente
      WHERE p.estado = 'Abierto'
      GROUP BY c.cliente_nombre ORDER BY nombre`);
    const result = runQuery(SQL, setup, sql);
    expect(result.columns).toEqual(['nombre', 'pedidos']);
    expect(result.rows).toEqual([
      ['Ana', 1],
      ['Bruno', 1],
    ]);
    expect(result.total).toBe(2);
    // El decimal se compara como número, no como texto.
    expect(runQuery(SQL, setup, 'SELECT precio * 2 FROM Producto').rows).toEqual([[2469]]);
    expect(() => runQuery(SQL, setup, 'SELECT * FROM NoExiste')).toThrow(/no such table/);
    expect(resultCsv(result)).toBe('﻿nombre;pedidos\r\nAna;1\r\nBruno;1\r\n');
  });
});
