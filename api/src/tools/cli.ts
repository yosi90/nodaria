import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { connectDatabase } from '../db/pool.ts';
import { linkAccount } from '../users/repository.ts';
import { exportBoard } from './board-export.ts';

/*
 * Órdenes de la migración a la cuenta de Yosiftware (ecosistema-kit/MIGRACION.md). Usan la base de
 * la configuración (`.env` o el archivo que se pase con --env-file):
 *
 *   enlazar-cuenta <id local> <identificador de la cuenta de Yosiftware>
 *   exportar-tablon <archivo.json>   (fuera de Git: lleva textos de personas)
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const [command, ...args] = process.argv.slice(2);
const config = loadConfig();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const db = await connectDatabase(config.db);
try {
  if (command === 'enlazar-cuenta') {
    const [localId, globalId] = args;
    if (!/^\d+$/.test(localId ?? '') || !GUID.test(globalId ?? ''))
      fail('Uso: enlazar-cuenta <id local> <identificador GUID de la cuenta de Yosiftware>');
    const result = await linkAccount(db, Number(localId), globalId);
    const line = { fecha: new Date().toISOString(), base: config.db.database, localId: Number(localId), globalId, ...result };
    console.log(JSON.stringify(line));
    if (!['linked', 'unchanged', 'moved'].includes(result.outcome)) process.exitCode = 1;
  } else if (command === 'exportar-tablon') {
    const [target] = args;
    if (!target) fail('Uso: exportar-tablon <archivo.json>');
    const { file, problems } = await exportBoard(db);
    await writeFile(path.resolve(target), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    console.log(
      JSON.stringify({
        base: config.db.database,
        archivo: path.resolve(target),
        peticiones: file.peticiones.length,
        respuestas: file.peticiones.reduce((n, p) => n + p.respuestas.length, 0),
        votos: file.peticiones.reduce((n, p) => n + p.votos.length, 0),
        usuariosSinEnlazar: problems.unlinkedUsers,
      }),
    );
    if (problems.unlinkedUsers.length) process.exitCode = 1;
  } else {
    fail('Órdenes: enlazar-cuenta <id local> <id global> | exportar-tablon <archivo.json>');
  }
} finally {
  await db.close();
}
