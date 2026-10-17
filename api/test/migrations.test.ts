import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readMigrations, runMigrations, splitBatches } from '../src/db/migrations.ts';
import { sql, type Database } from '../src/db/pool.ts';
import { createSqlFeedStore } from '../src/platform/feed.ts';
import { createSqlUserStore, linkAccount } from '../src/users/repository.ts';
import { OTHER, OWNER } from './helpers/fakes.ts';
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
      '0006_platform_identity',
      '0007_drop_request_board',
      '0008_ai_conversations',
      '0009_groups',
      '0010_group_comments',
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

  const count = async (table: string) =>
    Number((await db.request().query(`SELECT COUNT(*) AS n FROM dbo.${table}`)).recordset[0].n);
  const addProject = (userId: number, id: string) =>
    new sql.Request(db).input('user', sql.BigInt, userId).input('id', sql.VarChar(100), id)
      .query(`INSERT INTO dbo.projects (user_id, project_id, name, document, updated_at)
              VALUES (@user, @id, N'Mapa', N'{}', SYSUTCDATETIME())`);
  /** Un usuario de antes de la migración, solo con su UID de Firebase. */
  const legacyUser = async (uid: string) =>
    Number(
      (
        await new sql.Request(db)
          .input('uid', sql.NVarChar(128), uid)
          .query('INSERT INTO dbo.users (firebase_uid) OUTPUT inserted.id VALUES (@uid)')
      ).recordset[0].id,
    );

  it('crea y reutiliza usuarios por su identificador global y borra en cascada', async () => {
    const users = createSqlUserStore(db);
    const first = await users.findOrCreate(OWNER);
    const again = await users.findOrCreate(OWNER.toUpperCase());
    expect(again.id).toBe(first.id);
    expect(again.globalId).toBe(OWNER);
    expect(again.legacyAccount).toBeNull();
    // Varios usuarios nuevos sin UID de Firebase conviven (el índice único está filtrado).
    await users.findOrCreate(OTHER);
    await addProject(first.id, 'p1');
    await users.delete(first.id);
    expect(await count('projects')).toBe(0);
    await db.request().query('DELETE FROM dbo.users');
  });

  it('enlaza la cuenta de antes con su identificador global, sin duplicar ni robar cuentas', async () => {
    const users = createSqlUserStore(db);
    const old = await legacyUser('uid-firebase-propietario');
    await addProject(old, 'mapa-antiguo');
    expect(await linkAccount(db, 999_999, OWNER)).toMatchObject({ outcome: 'user_not_found' });
    expect(await linkAccount(db, old, OWNER)).toMatchObject({ outcome: 'linked' });
    expect(await linkAccount(db, old, OWNER)).toMatchObject({ outcome: 'unchanged' });
    expect(await linkAccount(db, old, OTHER)).toMatchObject({ outcome: 'already_linked' });
    // Al entrar, la cuenta enlazada encuentra a su usuario de siempre, con su UID antiguo.
    const found = await users.findOrCreate(OWNER);
    expect(found).toMatchObject({ id: old, legacyAccount: 'uid-firebase-propietario' });

    // Si entró antes de enlazar, el usuario nuevo y vacío cede su identificador al antiguo.
    const company = await legacyUser('uid-firebase-empresa');
    const early = await users.findOrCreate(OTHER);
    expect(await linkAccount(db, company, OTHER)).toMatchObject({ outcome: 'moved', movedFrom: early.id });
    expect((await users.findOrCreate(OTHER)).id).toBe(company);

    // Con proyectos en el usuario nuevo no se mueve nada: se decide a mano.
    const third = await legacyUser('uid-firebase-tercera');
    const busy = await users.findOrCreate('11111111-2222-3333-4444-555555555555');
    await addProject(busy.id, 'nuevo');
    expect(await linkAccount(db, third, busy.globalId)).toMatchObject({ outcome: 'taken_by_other', takenBy: busy.id });
    await db.request().query('DELETE FROM dbo.projects; DELETE FROM dbo.users');
  });

  it('aplica el estado de las cuentas del feed y guarda el cursor en la misma transacción', async () => {
    const users = createSqlUserStore(db);
    const feed = createSqlFeedStore(db);
    const owner = await users.findOrCreate(OWNER);
    const other = await users.findOrCreate(OTHER);
    await addProject(other.id, 'de-la-otra');
    expect(await feed.cursor()).toBe(0);
    const change = (id: number, cuenta: string, datos: unknown, tipo = 'cuenta.estado') => ({
      id,
      tipo,
      cuenta,
      cuenta2: null,
      datos,
      fecha: new Date().toISOString(),
    });
    await feed.apply(
      [
        change(1, OWNER, { alias: 'yosi' }, 'perfil.cambiado'),
        change(2, OWNER, { estado: 'cerrada', restricciones: ['creacion'], hasta: '2026-11-01T00:00:00.000Z' }),
        change(3, OTHER, { estado: 'borrada' }),
        change(4, '99999999-2222-3333-4444-555555555555', { estado: 'borrada' }),
      ],
      1058,
    );
    expect(await feed.cursor()).toBe(1058);
    const row = (
      await new sql.Request(db).input('id', sql.BigInt, owner.id).query('SELECT * FROM dbo.users WHERE id = @id')
    ).recordset[0];
    expect(row.closed_at).not.toBeNull();
    expect(row.restrictions).toBe('creacion');
    expect(await count('users')).toBe(1);
    expect(await count('projects')).toBe(0);
    // Repetir la lectura no cambia nada; «activa» recupera la cuenta.
    await feed.apply([change(5, OWNER, { estado: 'activa', restricciones: [], hasta: null })], 1060);
    expect((await users.findOrCreate(OWNER)).closedAt).toBeNull();
    await db.request().query('DELETE FROM dbo.users');
  });
});
