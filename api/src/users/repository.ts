import { type Database, sql, withTransaction } from '../db/pool.ts';

/*
 * Usuarios locales. La identidad es de la plataforma Yosiftware: cada usuario se reconoce por el
 * `sub` de su token (`id_global`). `id` sigue siendo la clave interna de la que cuelgan los proyectos.
 * `firebase_uid` solo queda en las cuentas de antes de la migración (el navegador lo usaba como
 * clave de su recuerdo de sincronización; ver `legacyAccount`).
 */

export interface User {
  id: number;
  globalId: string;
  /** UID de Firebase de la cuenta de antes de migrar, si la hay. */
  legacyAccount: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  disabledAt: Date | null;
  /** Borrado pedido o suspensión (`cuenta.estado` = cerrada en el feed). */
  closedAt: Date | null;
}

export type LinkResult =
  | { outcome: 'linked' | 'unchanged' | 'moved'; userId: number; movedFrom?: number }
  | { outcome: 'user_not_found' | 'taken_by_other' | 'already_linked'; userId: number; takenBy?: number };

export interface UserStore {
  /** Crea el usuario la primera vez que llega su `sub` y después refresca last_seen_at. */
  findOrCreate(globalId: string): Promise<User>;
  /** Borra el usuario y todo lo que cuelga de él (sus proyectos). */
  delete(userId: number): Promise<void>;
}

interface UserRow {
  id: number | string;
  id_global: string;
  firebase_uid: string | null;
  created_at: Date;
  last_seen_at: Date;
  disabled_at: Date | null;
  closed_at: Date | null;
}

function toUser(row: UserRow): User {
  return {
    // bigint puede llegar como cadena según el driver.
    id: Number(row.id),
    globalId: String(row.id_global).toLowerCase(),
    legacyAccount: row.firebase_uid,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    disabledAt: row.disabled_at,
    closedAt: row.closed_at,
  };
}

/**
 * Borra el usuario `@id` y lo que cuelga de él: sus proyectos en cascada y, mientras existan las tablas
 * del antiguo tablón, sus votos y las marcas de duplicado que apuntan a sus peticiones.
 */
export const DELETE_USER = `
  IF OBJECT_ID('dbo.request_votes', 'U') IS NOT NULL
  BEGIN
    DELETE FROM dbo.request_votes WHERE user_id = @id;
    UPDATE dbo.requests SET duplicate_of = NULL, status = 'abierta'
    WHERE duplicate_of IN (SELECT id FROM dbo.requests WHERE user_id = @id);
  END
  DELETE FROM dbo.users WHERE id = @id;`;

export function createSqlUserStore(db: Database): UserStore {
  return {
    async findOrCreate(globalId) {
      const result = await db.request().input('globalId', sql.UniqueIdentifier, globalId).query<UserRow>(`
          MERGE dbo.users WITH (HOLDLOCK) AS target
          USING (SELECT @globalId AS id_global) AS source
            ON target.id_global = source.id_global
          WHEN MATCHED THEN UPDATE SET last_seen_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (id_global) VALUES (@globalId)
          OUTPUT inserted.id, inserted.id_global, inserted.firebase_uid, inserted.created_at,
                 inserted.last_seen_at, inserted.disabled_at, inserted.closed_at;`);
      return toUser(result.recordset[0]);
    },

    async delete(userId) {
      await withTransaction(db, async transaction => {
        await new sql.Request(transaction).input('id', sql.BigInt, userId).query(DELETE_USER);
      });
    },
  };
}

/**
 * Enlaza el usuario local de una cuenta de antes de la migración con su cuenta de Yosiftware
 * (`ecosistema-kit/MIGRACION.md`, paso 5). Idempotente. Si la persona ya entró con la cuenta nueva y
 * la API le creó un usuario vacío (sin proyectos), el `id_global` se mueve de ese al antiguo y el
 * vacío se borra; si el otro usuario tiene proyectos, no se toca nada.
 */
export async function linkAccount(db: Database, userId: number, globalId: string): Promise<LinkResult> {
  return withTransaction(db, async transaction => {
    const request = () =>
      new sql.Request(transaction).input('id', sql.BigInt, userId).input('globalId', sql.UniqueIdentifier, globalId);
    const target = await request().query<{ id_global: string | null }>(
      'SELECT id_global FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE id = @id',
    );
    if (!target.recordset.length) return { outcome: 'user_not_found', userId };
    const current = target.recordset[0].id_global;
    if (current && String(current).toLowerCase() === globalId.toLowerCase()) return { outcome: 'unchanged', userId };
    // Un usuario ya enlazado con otra cuenta no se reasigna: habría que decidirlo a mano.
    if (current) return { outcome: 'already_linked', userId };

    const other = await request().query<{ id: number | string; projects: number }>(`
      SELECT u.id, (SELECT COUNT(*) FROM dbo.projects p WHERE p.user_id = u.id) AS projects
      FROM dbo.users u WITH (UPDLOCK, HOLDLOCK) WHERE u.id_global = @globalId AND u.id <> @id`);
    let movedFrom: number | undefined;
    if (other.recordset.length) {
      const holder = other.recordset[0];
      if (holder.projects > 0) return { outcome: 'taken_by_other', userId, takenBy: Number(holder.id) };
      movedFrom = Number(holder.id);
      await new sql.Request(transaction).input('id', sql.BigInt, movedFrom).query(DELETE_USER);
    }
    await request().query('UPDATE dbo.users SET id_global = @globalId WHERE id = @id');
    return movedFrom === undefined ? { outcome: 'linked', userId } : { outcome: 'moved', userId, movedFrom };
  });
}
