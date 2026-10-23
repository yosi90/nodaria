import type { SqlJsStatic } from 'sql.js';
import {
  COUNT_ROWS,
  RESULT_ROWS,
  createStatements,
  quoteSqlite,
  type QueryResult,
  type QuerySetup,
  type SqlValue,
} from '../domain/sqlQuery';

/*
 * Ejecuta una consulta en una base de SQLite en memoria con las tablas y filas de `setup`, y la descarta
 * al terminar. Lo usa el worker de las consultas (`sqlWorker.ts`) y, en las pruebas, sql.js en Node.
 * Con varias sentencias, el resultado es el de la última que devuelve columnas.
 */

const hex = (bytes: Uint8Array) =>
  `0x${[...bytes]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

export function runQuery(SQL: SqlJsStatic, setup: QuerySetup, sql: string): QueryResult {
  const started = performance.now();
  const db = new SQL.Database();
  try {
    db.run('BEGIN');
    createStatements(setup).forEach(statement => db.run(statement));
    setup.tables.forEach(t => {
      if (!t.rows.length || !t.columns.length) return;
      const insert = db.prepare(`INSERT INTO ${quoteSqlite(t.name)} VALUES (${t.columns.map(() => '?').join(', ')})`);
      t.rows.forEach(row => insert.run(row));
      insert.free();
    });
    db.run('COMMIT');

    let result: Omit<QueryResult, 'ms'> = { columns: [], rows: [], total: 0, more: false };
    for (const statement of db.iterateStatements(sql)) {
      const columns = statement.getColumnNames();
      const rows: SqlValue[][] = [];
      let total = 0;
      let more = false;
      while (statement.step()) {
        if (rows.length < RESULT_ROWS)
          rows.push(statement.get().map(v => (v instanceof Uint8Array ? hex(v) : (v as SqlValue))));
        if (++total >= COUNT_ROWS) {
          more = true;
          break;
        }
      }
      statement.free();
      if (columns.length) result = { columns, rows, total, more };
    }
    return { ...result, ms: Math.round(performance.now() - started) };
  } finally {
    db.close();
  }
}
