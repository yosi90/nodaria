import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Database, sql, withTransaction } from './pool.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  id: string;
  checksum: string;
  batches: string[];
}

export async function readMigrations(directory = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter(name => MIGRATION_FILE.test(name)).sort();

  return Promise.all(
    names.map(async name => {
      const source = (await readFile(path.join(directory, name), 'utf8')).replace(/\r\n/g, '\n');
      return {
        id: name.replace(/\.sql$/, ''),
        checksum: createHash('sha256').update(source).digest('hex'),
        batches: splitBatches(source),
      };
    }),
  );
}

// Las herramientas de SQL Server separan los lotes con una línea que solo contiene GO.
export function splitBatches(source: string) {
  return source
    .split(/^\s*GO\s*$/im)
    .map(batch => batch.trim())
    .filter(Boolean);
}

export async function ensureDatabase(master: Database, databaseName: string) {
  await master.request().input('name', sql.NVarChar(128), databaseName).query(`
      IF DB_ID(@name) IS NULL
      BEGIN
        DECLARE @statement nvarchar(400) = N'CREATE DATABASE ' + QUOTENAME(@name);
        EXEC (@statement);
      END`);
}

export async function runMigrations(db: Database, migrations: MigrationFile[]) {
  await db.request().batch(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        id nvarchar(200) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at datetime2(3) NOT NULL CONSTRAINT DF_schema_migrations_applied_at DEFAULT SYSUTCDATETIME()
      )`);

  const applied = new Map(
    (
      await db.request().query<{ id: string; checksum: string }>('SELECT id, checksum FROM dbo.schema_migrations')
    ).recordset.map(row => [row.id, row.checksum]),
  );

  const appliedNow: string[] = [];

  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.id);

    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(
          `La migración ${migration.id} ya está aplicada pero su contenido ha cambiado. Crea una migración nueva en lugar de editarla.`,
        );
      }
      continue;
    }

    await withTransaction(db, async transaction => {
      for (const batch of migration.batches) {
        await new sql.Request(transaction).batch(batch);
      }
      await new sql.Request(transaction)
        .input('id', sql.NVarChar(200), migration.id)
        .input('checksum', sql.Char(64), migration.checksum)
        .query('INSERT INTO dbo.schema_migrations (id, checksum) VALUES (@id, @checksum)');
    });
    appliedNow.push(migration.id);
  }

  return appliedNow;
}
