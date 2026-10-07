import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readMigrations, runMigrations, splitBatches } from '../src/db/migrations.ts';
import { sql, type Database } from '../src/db/pool.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import { identity } from './helpers/fakes.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

describe('migration files', () => {
  it('splits batches on GO lines only', () => {
    expect(splitBatches('CREATE TABLE a (x int);\nGO\n\nCREATE INDEX i ON a (x);\n')).toEqual([
      'CREATE TABLE a (x int);',
      'CREATE INDEX i ON a (x);',
    ]);
    expect(splitBatches("SELECT 'GO' AS word;")).toEqual(["SELECT 'GO' AS word;"]);
  });

  it('reads the repository migrations in order with checksums', async () => {
    const migrations = await readMigrations();
    expect(migrations.map(m => m.id)).toEqual([
      '0001_users',
      '0002_projects',
      '0003_messages',
      '0004_requests',
      '0005_admins',
    ]);
    for (const migration of migrations) {
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(migration.batches.length).toBeGreaterThan(0);
    }
  });
});

// Integración con SQL Server local: DB_TESTS=1 npm test
describe.runIf(dbTestsEnabled)('SQL Server integration', () => {
  let db: Database;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
  });
  afterAll(async () => {
    await drop();
  });

  it('applies every migration once and refuses edited ones', async () => {
    const migrations = await readMigrations();
    expect(await runMigrations(db, migrations)).toEqual(migrations.map(m => m.id));
    expect(await runMigrations(db, migrations)).toEqual([]);

    const edited = [{ ...migrations[0], checksum: 'f'.repeat(64) }];
    await expect(runMigrations(db, edited)).rejects.toThrow(/0001_users/);
  });

  it('creates and refreshes users, and cascades the delete', async () => {
    const users = createSqlUserStore(db);
    const first = await users.upsert(identity({ uid: 'sql-uid', displayName: 'Primero' }));
    const second = await users.upsert(identity({ uid: 'sql-uid', displayName: 'Segundo' }));
    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('Segundo');
    expect(second.isAdmin).toBe(false);
    expect(second.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());

    await new sql.Request(db).input('user', sql.BigInt, first.id)
      .query(`INSERT INTO dbo.projects (user_id, project_id, name, document, updated_at)
              VALUES (@user, 'p1', N'Mapa', N'{"id":"p1"}', SYSUTCDATETIME())`);

    let rolledBack = false;
    await users
      .delete(first.id, async () => {
        throw new Error('firebase down');
      })
      .catch(() => {
        rolledBack = true;
      });
    expect(rolledBack).toBe(true);
    expect((await db.request().query('SELECT COUNT(*) AS n FROM dbo.users')).recordset[0].n).toBe(1);

    await users.delete(first.id, async () => undefined);
    expect((await db.request().query('SELECT COUNT(*) AS n FROM dbo.users')).recordset[0].n).toBe(0);
    expect((await db.request().query('SELECT COUNT(*) AS n FROM dbo.projects')).recordset[0].n).toBe(0);
  });
});
