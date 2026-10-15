-- Migración a la cuenta de Yosiftware (ecosistema-kit/MIGRACION.md, paso 2).
-- La identidad la da la plataforma: cada usuario local se enlaza con el `sub` de su token (id_global).
-- users.id no cambia, así que los proyectos siguen colgando del mismo usuario. Las columnas de
-- Firebase dejan de escribirse y se conservan hasta verificar la migración en producción.

-- firebase_uid pasa a ser opcional: los usuarios nuevos solo tienen id_global. Un UNIQUE de SQL
-- Server admite un solo NULL, así que se sustituye por un índice único filtrado.
ALTER TABLE dbo.users DROP CONSTRAINT UQ_users_firebase_uid;
GO

ALTER TABLE dbo.users ALTER COLUMN firebase_uid nvarchar(128) NULL;
GO

CREATE UNIQUE INDEX UX_users_firebase_uid ON dbo.users (firebase_uid) WHERE firebase_uid IS NOT NULL;
GO

-- El `sub` es un GUID de SQL Server (no un UUID del RFC 4122).
ALTER TABLE dbo.users ADD
  id_global uniqueidentifier NULL,
  -- Con `cuenta.estado` = cerrada (borrado pedido o suspensión) la cuenta se esconde; activa la recupera.
  closed_at datetime2(3) NULL,
  -- Lo limitado por moderación según el feed (alcances separados por comas) y hasta cuándo.
  restrictions nvarchar(200) NULL,
  restrictions_until datetime2(3) NULL;
GO

CREATE UNIQUE INDEX UX_users_id_global ON dbo.users (id_global) WHERE id_global IS NOT NULL;
GO

-- Cursor del feed de cambios de la plataforma (ecosistema-kit/FEED_DE_CAMBIOS.md): una sola fila,
-- que se guarda en la misma transacción que los cambios aplicados.
CREATE TABLE dbo.platform_feed (
  id tinyint NOT NULL CONSTRAINT PK_platform_feed PRIMARY KEY CONSTRAINT CK_platform_feed_single CHECK (id = 1),
  feed_cursor bigint NOT NULL CONSTRAINT DF_platform_feed_cursor DEFAULT 0,
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_platform_feed_updated_at DEFAULT SYSUTCDATETIME()
);
GO

INSERT INTO dbo.platform_feed (id, feed_cursor) VALUES (1, 0);
