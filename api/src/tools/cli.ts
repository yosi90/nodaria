import { loadConfig } from '../config.ts';
import { connectDatabase } from '../db/pool.ts';
import { ANNOUNCEMENT_KINDS, announceToYosiftware, type AnnouncementKind } from '../platform/news.ts';
import { PlatformError } from '../platform/http.ts';
import { linkAccount } from '../users/repository.ts';

/*
 * Órdenes de mantenimiento. Usan la configuración del entorno (`.env` o el archivo que se pase con
 * --env-file):
 *
 *   enlazar-cuenta <id local> <identificador de la cuenta de Yosiftware>   (ecosistema-kit/MIGRACION.md)
 *   anunciar <tipo> <idExterno> "<texto>" [enlace]                          (ecosistema-kit/NOVEDADES.md)
 *
 * `anunciar` publica una novedad de Yosiftware al sacar a producción algo que la gente nota; con el
 * mismo idExterno corrige el anuncio en vez de repetirlo.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, ...args] = process.argv.slice(2);
const config = loadConfig();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (command === 'anunciar') {
  const [tipo, idExterno, texto, enlace] = args;
  if (!tipo || !idExterno || !texto)
    fail(`Uso: anunciar <${ANNOUNCEMENT_KINDS.join('|')}> <idExterno> "<texto con el nombre de Nodaria>" [enlace]`);
  try {
    const result = await announceToYosiftware(config.platform, {
      tipo: tipo as AnnouncementKind,
      idExterno,
      texto,
      ...(enlace ? { enlace } : {}),
    });
    console.log(JSON.stringify({ fecha: new Date().toISOString(), entorno: config.platform.env, idExterno, result }));
  } catch (error) {
    fail(error instanceof PlatformError ? `${error.code}: ${error.message}` : String(error));
  }
} else if (command === 'enlazar-cuenta') {
  const db = await connectDatabase(config.db);
  try {
    const [localId, globalId] = args;
    if (!/^\d+$/.test(localId ?? '') || !GUID.test(globalId ?? ''))
      fail('Uso: enlazar-cuenta <id local> <identificador GUID de la cuenta de Yosiftware>');
    const result = await linkAccount(db, Number(localId), globalId);
    const line = {
      fecha: new Date().toISOString(),
      base: config.db.database,
      localId: Number(localId),
      globalId,
      ...result,
    };
    console.log(JSON.stringify(line));
    if (!['linked', 'unchanged', 'moved'].includes(result.outcome)) process.exitCode = 1;
  } finally {
    await db.close();
  }
} else {
  fail('Órdenes: enlazar-cuenta <id local> <id global> · anunciar <tipo> <idExterno> "<texto>" [enlace]');
}
