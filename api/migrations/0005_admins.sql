-- Administradores: pueden gestionar las peticiones desde el panel de la web.
-- Se conceden a mano: UPDATE dbo.users SET is_admin = 1 WHERE firebase_uid = N'<uid>';
ALTER TABLE dbo.users ADD is_admin bit NOT NULL CONSTRAINT DF_users_is_admin DEFAULT 0;
