import { loadConfig } from '../config.ts';
import { ensureDatabase, readMigrations, runMigrations } from './migrations.ts';
import { connectDatabase } from './pool.ts';

const config = loadConfig();

const master = await connectDatabase({ ...config.db, database: 'master' });
try {
  await ensureDatabase(master, config.db.database);
} finally {
  await master.close();
}

const db = await connectDatabase(config.db);
try {
  const applied = await runMigrations(db, await readMigrations());
  console.log(
    applied.length > 0
      ? `Migraciones aplicadas en ${config.db.database}: ${applied.join(', ')}`
      : `${config.db.database} ya está al día.`,
  );
} finally {
  await db.close();
}
