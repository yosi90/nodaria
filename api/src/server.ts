import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.ts';
import { createFirebaseAuthProvider } from './auth/firebase.ts';
import { loadConfig } from './config.ts';
import { connectDatabase } from './db/pool.ts';
import { createOutboxDrainer, createSqlOutboxStore } from './notificapp/outbox.ts';
import { createSqlProjectStore } from './projects/repository.ts';
import { createSqlRequestStore } from './requests/repository.ts';
import { createSqlUserStore } from './users/repository.ts';

const config = loadConfig();
const db = await connectDatabase(config.db);
let drainer: ReturnType<typeof createOutboxDrainer> | null = null;
const app = await buildApp({
  config,
  db,
  auth: createFirebaseAuthProvider(config),
  users: createSqlUserStore(db),
  projects: createSqlProjectStore(db),
  requests: createSqlRequestStore(db),
  onRequestQueued: () => void drainer?.trigger(),
});

if (config.notificapp.enabled) {
  drainer = createOutboxDrainer({ outbox: createSqlOutboxStore(db), config: config.notificapp, log: app.log });
  drainer.start();
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando…`);
  await app.close();
  await drainer?.stop();
  await db.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// Un despliegue pide reinicio creando este archivo (ops/restart-api.ps1): la API sale
// limpiamente y el vigilante arranca el build nuevo. No hacen falta permisos sobre el proceso,
// que corre en la sesión propia de la tarea programada de Windows.
const restartRequest = path.join(config.logDir || 'logs', 'restart.request');
setInterval(() => {
  if (!existsSync(restartRequest)) return;
  rmSync(restartRequest, { force: true });
  void shutdown('Reinicio solicitado');
}, 2_000).unref();

await app.listen({ host: config.host, port: config.port });
