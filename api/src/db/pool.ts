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

function createPool(target: AppConfig['db']) {
  // msnodesqlv8 usa connectionString tal cual; server es solo informativo.
  const config: sql.config & { connectionString: string } = {
    server: target.server,
    connectionString: buildConnectionString(target),
    connectionTimeout: 10_000,
    pool: { min: 1, max: 10, idleTimeoutMillis: 30_000 },
  };
  return new sql.ConnectionPool(config);
}

/** Conecta y espera a la base: para las órdenes y las migraciones, que no tienen nada que hacer sin ella. */
export async function connectDatabase(target: AppConfig['db']): Promise<Database> {
  return createPool(target).connect();
}

/** La base de la API, que puede no estar lista todavía (al iniciar Windows, SQL Server tarda). */
export interface DatabaseLink {
  /** El pool, conectado o no: mientras no lo esté, sus peticiones fallan al momento (`ENOTOPEN`). */
  db: Database;
  connected(): boolean;
  /** Si no está conectada, lo intenta (un solo intento a la vez). `true` si queda conectada. */
  ensure(): Promise<boolean>;
  /** Reintenta en segundo plano, con una espera que crece de 5 s a 5 min, hasta conectar. */
  start(): void;
  stop(): void;
}

type Log = { info(message: string): void; warn(details: object, message: string): void };

export function linkDatabase(
  pool: Pick<Database, 'connect' | 'connected'>,
  log: Log,
  { minDelayMs = 5_000, maxDelayMs = 300_000 } = {},
): Omit<DatabaseLink, 'db'> {
  let attempt: Promise<boolean> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let delay = minDelayMs;
  let stopped = false;

  function ensure() {
    if (pool.connected) return Promise.resolve(true);
    attempt ??= pool
      .connect()
      .then(
        () => {
          log.info('Base de datos conectada.');
          return true;
        },
        (error: unknown) => {
          log.warn({ err: error }, 'La base de datos no está disponible; se reintentará.');
          return false;
        },
      )
      .finally(() => {
        attempt = null;
      });
    return attempt;
  }

  function schedule() {
    if (stopped || pool.connected) return;
    timer = setTimeout(() => {
      void ensure().then(ok => {
        if (ok) return;
        delay = Math.min(delay * 2, maxDelayMs);
        schedule();
      });
    }, delay);
    timer.unref();
  }

  return {
    connected: () => pool.connected,
    ensure,
    start() {
      stopped = false;
      void ensure().then(ok => {
        if (!ok) schedule();
      });
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** La base de la API: arranca sin esperarla y se conecta en cuanto esté (kit 1.81, `SERVIDOR.md`). */
export function openDatabase(target: AppConfig['db'], log: Log): DatabaseLink {
  const db = createPool(target);
  // Sin esto, un pool que no llega a conectar emite «error» sin oyente y tumba el proceso.
  db.on('error', (error: unknown) => log.warn({ err: error }, 'Error del pool de la base de datos.'));
  return { db, ...linkDatabase(db, log) };
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
