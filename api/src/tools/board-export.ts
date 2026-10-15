import type { Database } from '../db/pool.ts';

/*
 * Archivo del antiguo tablón de ideas y errores para que la plataforma lo importe en sus errores y
 * propuestas (formato `nodaria-tablon-1` de la petición de migración). Todo va tal cual: ids,
 * estados y duplicados de Nodaria, con las fechas en UTC y cada cuenta por su identificador global.
 */

export interface BoardFile {
  formato: 'nodaria-tablon-1';
  exportadoUtc: string;
  peticiones: {
    id: number;
    tipo: 'idea' | 'error';
    autor: string | null;
    titulo: string;
    texto: string;
    estado: string;
    duplicadoDe: number | null;
    creadoUtc: string;
    actualizadoUtc: string;
    leidoAutorUtc: string | null;
    respuestas: { estado: string; mensaje: string | null; fechaUtc: string }[];
    votos: { cuenta: string | null; fechaUtc: string }[];
  }[];
}

/** Autores o votantes sin cuenta enlazada: la plataforma necesita su identificador global. */
export interface BoardProblems {
  unlinkedUsers: number[];
}

const utc = (value: Date) => value.toISOString();
const guid = (value: string | null) => (value ? String(value).toLowerCase() : null);

export async function exportBoard(db: Database, now = new Date()): Promise<{ file: BoardFile; problems: BoardProblems }> {
  const requests = await db.request().query<{
    id: number | string;
    kind: 'idea' | 'error';
    user_id: number | string;
    id_global: string | null;
    title: string;
    body: string;
    status: string;
    duplicate_of: number | string | null;
    created_at: Date;
    updated_at: Date;
    author_read_at: Date | null;
  }>(`
    SELECT r.id, r.kind, r.user_id, u.id_global, r.title, r.body, r.status, r.duplicate_of,
           r.created_at, r.updated_at, r.author_read_at
    FROM dbo.requests r JOIN dbo.users u ON u.id = r.user_id
    ORDER BY r.id`);
  const updates = await db.request().query<{
    request_id: number | string;
    status: string;
    message: string | null;
    created_at: Date;
  }>('SELECT request_id, status, message, created_at FROM dbo.request_updates ORDER BY request_id, created_at, id');
  const votes = await db.request().query<{
    request_id: number | string;
    user_id: number | string;
    id_global: string | null;
    created_at: Date;
  }>(`
    SELECT v.request_id, v.user_id, u.id_global, v.created_at
    FROM dbo.request_votes v JOIN dbo.users u ON u.id = v.user_id
    ORDER BY v.request_id, v.created_at`);

  const unlinked = new Set<number>();
  const file: BoardFile = {
    formato: 'nodaria-tablon-1',
    exportadoUtc: utc(now),
    peticiones: requests.recordset.map(r => {
      if (!r.id_global) unlinked.add(Number(r.user_id));
      const id = Number(r.id);
      return {
        id,
        tipo: r.kind,
        autor: guid(r.id_global),
        titulo: r.title,
        texto: r.body,
        estado: r.status,
        duplicadoDe: r.duplicate_of === null ? null : Number(r.duplicate_of),
        creadoUtc: utc(r.created_at),
        actualizadoUtc: utc(r.updated_at),
        leidoAutorUtc: r.author_read_at ? utc(r.author_read_at) : null,
        respuestas: updates.recordset
          .filter(u => Number(u.request_id) === id)
          .map(u => ({ estado: u.status, mensaje: u.message, fechaUtc: utc(u.created_at) })),
        votos: votes.recordset
          .filter(v => Number(v.request_id) === id)
          .map(v => {
            if (!v.id_global) unlinked.add(Number(v.user_id));
            return { cuenta: guid(v.id_global), fechaUtc: utc(v.created_at) };
          }),
      };
    }),
  };
  return { file, problems: { unlinkedUsers: [...unlinked].sort((a, b) => a - b) } };
}
