import type { VerifiedIdentity } from '../auth/firebase.ts';
import { type Database, sql, withTransaction } from '../db/pool.ts';

export interface User {
  id: number;
  firebaseUid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  disabledAt: Date | null;
}

export interface UserStore {
  // Crea el usuario la primera vez y después refresca perfil y last_seen_at.
  upsert(identity: VerifiedIdentity): Promise<User>;
  // Borra el usuario y todo lo que cuelga de él. `beforeCommit` corre dentro de la
  // transacción: si lanza, no se borra nada.
  delete(userId: number, beforeCommit: () => Promise<void>): Promise<void>;
}

interface UserRow {
  id: number | string;
  firebase_uid: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
  photo_url: string | null;
  created_at: Date;
  last_seen_at: Date;
  disabled_at: Date | null;
}

function toUser(row: UserRow): User {
  return {
    // bigint puede llegar como cadena según el driver.
    id: Number(row.id),
    firebaseUid: row.firebase_uid,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    displayName: row.display_name,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    disabledAt: row.disabled_at,
  };
}

export function createSqlUserStore(db: Database): UserStore {
  return {
    async upsert(identity) {
      const result = await db
        .request()
        .input('uid', sql.NVarChar(128), identity.uid)
        .input('email', sql.NVarChar(320), identity.email)
        .input('emailVerified', sql.Bit, identity.emailVerified)
        .input('displayName', sql.NVarChar(200), identity.displayName?.slice(0, 200) ?? null)
        .input('photoUrl', sql.NVarChar(2048), identity.photoUrl?.slice(0, 2048) ?? null).query<UserRow>(`
          MERGE dbo.users WITH (HOLDLOCK) AS target
          USING (SELECT @uid AS firebase_uid) AS source
            ON target.firebase_uid = source.firebase_uid
          WHEN MATCHED THEN UPDATE SET
            email = @email,
            email_verified = @emailVerified,
            display_name = @displayName,
            photo_url = @photoUrl,
            last_seen_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (firebase_uid, email, email_verified, display_name, photo_url)
            VALUES (@uid, @email, @emailVerified, @displayName, @photoUrl)
          OUTPUT inserted.id, inserted.firebase_uid, inserted.email, inserted.email_verified,
                 inserted.display_name, inserted.photo_url, inserted.created_at,
                 inserted.last_seen_at, inserted.disabled_at;`);

      return toUser(result.recordset[0]);
    },

    async delete(userId, beforeCommit) {
      await withTransaction(db, async transaction => {
        // Las tablas de datos referencian dbo.users con ON DELETE CASCADE.
        await new sql.Request(transaction)
          .input('id', sql.BigInt, userId)
          .query('DELETE FROM dbo.users WHERE id = @id');
        await beforeCommit();
      });
    },
  };
}
