-- Proyectos de Nodaria: un documento JSON por proyecto y usuario, tal como lo guarda el
-- front (Project), con una versión que crece en cada escritura. El cliente envía la versión
-- de la que partió (baseVersion); si no coincide, la API responde 409 y el cliente decide.
-- updated_at es Project.updatedAt según el cliente; server_updated_at la hora del servidor.
-- Un borrado es lógico: deleted_at con documento NULL, para que otros dispositivos lo reciban.
CREATE TABLE dbo.projects (
  user_id bigint NOT NULL
    CONSTRAINT FK_projects_users REFERENCES dbo.users (id) ON DELETE CASCADE,
  project_id varchar(100) NOT NULL,
  name nvarchar(200) NOT NULL,
  document nvarchar(max) NULL,
  version int NOT NULL CONSTRAINT DF_projects_version DEFAULT 1,
  size_bytes int NOT NULL CONSTRAINT DF_projects_size_bytes DEFAULT 0,
  updated_at datetime2(3) NOT NULL,
  server_updated_at datetime2(3) NOT NULL CONSTRAINT DF_projects_server_updated_at DEFAULT SYSUTCDATETIME(),
  deleted_at datetime2(3) NULL,
  CONSTRAINT PK_projects PRIMARY KEY (user_id, project_id),
  CONSTRAINT CK_projects_document CHECK (
    (deleted_at IS NOT NULL AND document IS NULL)
    OR (deleted_at IS NULL AND document IS NOT NULL AND ISJSON(document) = 1)
  )
);
GO

CREATE INDEX IX_projects_user_updated ON dbo.projects (user_id, server_updated_at DESC);
