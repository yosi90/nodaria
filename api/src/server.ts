import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createGatewayAssistant } from './ai/assistant.ts';
import { createSqlConversationStore } from './ai/conversations.ts';
import { buildApp } from './app.ts';
import { createPlatformAuthProvider } from './auth/platform.ts';
import { loadConfig } from './config.ts';
import { connectDatabase } from './db/pool.ts';
import { createGroupMaintenance } from './groups/maintenance.ts';
import { createSqlGroupStore } from './groups/repository.ts';
import { createFeedClient, createFeedReader, createSqlFeedStore } from './platform/feed.ts';
import { createPlatformSpacesClient } from './platform/spaces.ts';
import { createSqlProjectStore } from './projects/repository.ts';
import { createSqlUserStore } from './users/repository.ts';

const config = loadConfig();
const db = await connectDatabase(config.db);
const groups = createSqlGroupStore(db);
const spaces = createPlatformSpacesClient(config.platform);
// El feed de la plataforma avisa de las cuentas cerradas o borradas y de los cambios de los espacios
// (ecosistema-kit/FEED_DE_CAMBIOS.md y ESPACIOS.md). Se lee cada cierto tiempo y a petición.
let feed: ReturnType<typeof createFeedReader> | null = null;
const app = await buildApp({
  config,
  db,
  auth: createPlatformAuthProvider(config),
  users: createSqlUserStore(db),
  projects: createSqlProjectStore(db),
  ai: createGatewayAssistant({
    platformApi: config.platform.api,
    serviceTokenFile: config.platform.serviceTokenFile,
  }),
  conversations: createSqlConversationStore(db),
  groups,
  spaces,
  feed: { readOnce: () => feed?.readOnce() ?? Promise.resolve(0) },
});

feed = config.platform.feedEnabled
  ? createFeedReader({
      store: createSqlFeedStore(db),
      fetchPage: createFeedClient(config.platform),
      intervalMs: config.platform.feedIntervalMs,
      log: app.log,
    })
  : null;
feed?.start();
// Roles declarados y borrados de espacios pendientes, con el mismo ritmo que el feed.
const maintenance = config.platform.feedEnabled
  ? createGroupMaintenance({ groups, spaces, intervalMs: config.platform.feedIntervalMs, log: app.log })
  : null;
maintenance?.start();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando…`);
  await app.close();
  await feed?.stop();
  await maintenance?.stop();
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
