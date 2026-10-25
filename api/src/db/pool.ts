import sql from 'mssql/msnodesqlv8.js';
import type { AppConfig } from '../config.ts';

export { sql };
export type Database = sql.ConnectionPool;

export interface DbTarget {
  server: string;
  database: string;
  driver: string;
}

// Autenticación de Windows: la API se conecta con la identidad de su propio proceso.
export function buildConnectionString(target: DbTarget) {
  return [
    `Driver={${target.driver}}`,
    `Server=${target.server}`,
    `Database=${target.database}`,
    'Trusted_Connection=yes',
    'TrustServerCertificate=yes',
  ].join(';');
}

export async function connectDatabase(target: AppConfig['db']): Promise<Database> {
  // msnodesqlv8 usa connectionString tal cual; server es solo informativo.
  const config: sql.config & { connectionString: string } = {
    server: target.server,
    connectionString: buildConnectionString(target),
    pool: { min: 1, max: 10, idleTimeoutMillis: 30_000 },
  };
  const pool = new sql.ConnectionPool(config);

  return pool.connect();
}

/** Un GUID de SQL Server como texto en minúsculas (el driver lo da en mayúsculas). */
export const guid = (value: string | null) => (value === null ? null : String(value).toLowerCase());

/** Una lista de columnas («a, b») con el prefijo de su tabla o de `inserted` («p.a, p.b»). */
export const prefixed = (columns: string, prefix: string) =>
  columns
    .split(', ')
    .map(column => `${prefix}.${column}`)
    .join(', ');

export async function withTransaction<T>(db: Database, work: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(db);
  await transaction.begin();

  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}
