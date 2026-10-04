-- Cuentas locales enlazadas a Firebase Authentication.
-- Firebase es la fuente de identidad; esta tabla es el ancla de los datos de cada usuario.
CREATE TABLE dbo.users (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
  firebase_uid nvarchar(128) NOT NULL CONSTRAINT UQ_users_firebase_uid UNIQUE,
  email nvarchar(320) NULL,
  email_verified bit NOT NULL CONSTRAINT DF_users_email_verified DEFAULT 0,
  display_name nvarchar(200) NULL,
  photo_url nvarchar(2048) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
  last_seen_at datetime2(3) NOT NULL CONSTRAINT DF_users_last_seen_at DEFAULT SYSUTCDATETIME(),
  disabled_at datetime2(3) NULL
);
GO

CREATE INDEX IX_users_email ON dbo.users (email);
