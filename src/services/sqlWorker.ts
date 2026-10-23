/// <reference lib="webworker" />
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type { QuerySetup } from '../domain/sqlQuery';
import { runQuery } from './sqlRunner';

/*
 * Worker de las consultas (docs/roadmaps/ROADMAP_DATOS_BD.md): SQLite (sql.js) fuera del hilo de la página,
 * para que una consulta pesada no la congele y se pueda cancelar terminando el worker. El .wasm se sirve
 * desde el propio origen (la CSP lo permite con 'wasm-unsafe-eval').
 */

let engine: Promise<SqlJsStatic> | null = null;

self.onmessage = async (event: MessageEvent<{ id: number; setup: QuerySetup; sql: string }>) => {
  const { id, setup, sql } = event.data;
  try {
    engine ??= initSqlJs({ locateFile: () => wasmUrl });
    const SQL = await engine;
    self.postMessage({ id, result: runQuery(SQL, setup, sql) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
