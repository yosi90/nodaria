import type { QueryResult, QuerySetup } from '../domain/sqlQuery';

/*
 * Cliente del worker de consultas (`sqlWorker.ts`). El worker se crea con la primera consulta (así sql.js
 * solo se descarga si se usa) y se reutiliza; cancelar o pasarse de tiempo lo termina y la siguiente
 * consulta crea otro.
 */

/** Una consulta que tarda más se corta (un producto cartesiano de dos tablas grandes, por ejemplo). */
export const QUERY_TIMEOUT_MS = 20000;

export class QueryCancelled extends Error {}

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, { resolve: (r: QueryResult) => void; reject: (e: Error) => void }>();

function workerOf() {
  if (worker) return worker;
  worker = new Worker(new URL('./sqlWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: number; result?: QueryResult; error?: string }>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.result) job.resolve(event.data.result);
    else job.reject(new Error(event.data.error ?? 'Error desconocido'));
  };
  worker.onerror = event => {
    event.preventDefault();
    stop(new Error('No se pudo cargar el motor de consultas. Comprueba la conexión y vuelve a intentarlo.'));
  };
  return worker;
}

/** Termina el worker y rechaza lo que estuviera en marcha. */
function stop(reason: Error) {
  worker?.terminate();
  worker = null;
  pending.forEach(job => job.reject(reason));
  pending.clear();
}

export function runSql(setup: QuerySetup, sql: string, timeoutMs = QUERY_TIMEOUT_MS) {
  const id = ++sequence;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<QueryResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    timer = setTimeout(
      () => stop(new QueryCancelled(`La consulta tardaba más de ${timeoutMs / 1000} segundos y se ha cortado.`)),
      timeoutMs,
    );
    workerOf().postMessage({ id, setup, sql });
  }).finally(() => clearTimeout(timer));
  return { promise, cancel: () => pending.has(id) && stop(new QueryCancelled('Consulta cancelada.')) };
}
