import { randomBytes } from 'node:crypto';
import { loadConfig } from '../../src/config.ts';
import { ensureDatabase } from '../../src/db/migrations.ts';
import { connectDatabase, type Database } from '../../src/db/pool.ts';

export const dbTestsEnabled = process.env.DB_TESTS === '1';

// Crea Nodaria_test_<hex> en el SQL Server local; drop() la elimina.
export async function createTestDatabase() {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' });
  const name = `Nodaria_test_${randomBytes(4).toString('hex')}`;
  const master = await connectDatabase({ ...config.db, database: 'master' });
  await ensureDatabase(master, name);
  const db: Database = await connectDatabase({ ...config.db, database: name });

  async function drop() {
    await db.close();
    await master.request().batch(
      `IF DB_ID('${name}') IS NOT NULL
       BEGIN
         ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
         DROP DATABASE [${name}];
       END`,
    );
    await master.close();
  }

  return { db, drop };
}
