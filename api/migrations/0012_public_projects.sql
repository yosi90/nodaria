-- Proyectos públicos (docs/roadmaps/ROADMAP_COMUNIDAD.md). Publicar sube una copia de solo lectura del
-- proyecto, aparte del documento privado: lo que se edita a medias no sale hasta «Publicar los cambios».
-- El id es público y aleatorio (va en el enlace); el proyecto privado no se enseña nunca. state: publico, o
-- retirado por moderación (no se ve y la persona dueña lo sabe). Se borra con la cuenta.
CREATE TABLE dbo.public_projects (
  id varchar(20) NOT NULL CONSTRAINT PK_public_projects PRIMARY KEY,
  user_id bigint NOT NULL
    CONSTRAINT FK_public_projects_users REFERENCES dbo.users (id) ON DELETE CASCADE,
  project_id varchar(100) NOT NULL,
  name nvarchar(200) NOT NULL,
  description nvarchar(1000) NOT NULL CONSTRAINT DF_public_projects_description DEFAULT '',
  document nvarchar(max) NOT NULL CONSTRAINT CK_public_projects_document CHECK (ISJSON(document) = 1),
  size_bytes int NOT NULL,
  node_count int NOT NULL,
  relation_count int NOT NULL,
  options nvarchar(2000) NOT NULL CONSTRAINT CK_public_projects_options CHECK (ISJSON(options) = 1),
  allow_copy bit NOT NULL CONSTRAINT DF_public_projects_allow_copy DEFAULT 0,
  state varchar(20) NOT NULL CONSTRAINT DF_public_projects_state DEFAULT 'publico'
    CONSTRAINT CK_public_projects_state CHECK (state IN ('publico', 'retirado')),
  retired_reason nvarchar(500) NULL,
  version int NOT NULL CONSTRAINT DF_public_projects_version DEFAULT 1,
  published_at datetime2(3) NOT NULL CONSTRAINT DF_public_projects_published_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_public_projects_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_public_projects_project UNIQUE (user_id, project_id)
);
GO

CREATE INDEX IX_public_projects_recent ON dbo.public_projects (state, updated_at DESC);
GO

-- Las novedades publicadas en la plataforma por cada proyecto público (su idExterno), para retirarlas
-- todas al dejar de publicarlo, al retirarlo o al borrar el proyecto. Sin clave ajena al público: se
-- conservan hasta que la retirada se ha encolado.
CREATE TABLE dbo.public_news (
  external_id varchar(120) NOT NULL CONSTRAINT PK_public_news PRIMARY KEY,
  public_id varchar(20) NOT NULL,
  user_id bigint NOT NULL
    CONSTRAINT FK_public_news_users REFERENCES dbo.users (id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_public_news_public ON dbo.public_news (public_id);
GO

-- Denuncias de proyectos públicos: lo propio de Nodaria (ecosistema-kit/MODERACION.md). Las atiende el
-- propietario desde el plugin de Notificapp. Una por persona y proyecto; nadie sabe quién denunció.
CREATE TABLE dbo.public_reports (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_public_reports PRIMARY KEY,
  public_id varchar(20) NOT NULL
    CONSTRAINT FK_public_reports_public_projects REFERENCES dbo.public_projects (id) ON DELETE CASCADE,
  reporter uniqueidentifier NOT NULL,
  reason varchar(30) NOT NULL,
  body nvarchar(500) NOT NULL CONSTRAINT DF_public_reports_body DEFAULT '',
  state varchar(20) NOT NULL CONSTRAINT DF_public_reports_state DEFAULT 'pendiente'
    CONSTRAINT CK_public_reports_state CHECK (state IN ('pendiente', 'retirado', 'desestimado')),
  note nvarchar(500) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_public_reports_created_at DEFAULT SYSUTCDATETIME(),
  resolved_at datetime2(3) NULL,
  CONSTRAINT UQ_public_reports_reporter UNIQUE (public_id, reporter)
);
GO

CREATE INDEX IX_public_reports_state ON dbo.public_reports (state, created_at);
GO

-- Cola de salida hacia la plataforma (novedades) y Notificapp (avisos de denuncias). Se escribe en la
-- misma transacción que el cambio y se envía después, con reintentos; cada envío es idempotente por su
-- external_id. channel: novedades o notificapp; operation: publicar o retirar.
CREATE TABLE dbo.outbox (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_outbox PRIMARY KEY,
  channel varchar(20) NOT NULL CONSTRAINT CK_outbox_channel CHECK (channel IN ('novedades', 'notificapp')),
  operation varchar(20) NOT NULL CONSTRAINT CK_outbox_operation CHECK (operation IN ('publicar', 'retirar')),
  external_id varchar(120) NOT NULL,
  payload nvarchar(max) NOT NULL CONSTRAINT CK_outbox_payload CHECK (ISJSON(payload) = 1),
  attempts int NOT NULL CONSTRAINT DF_outbox_attempts DEFAULT 0,
  next_attempt_at datetime2(3) NOT NULL CONSTRAINT DF_outbox_next_attempt_at DEFAULT SYSUTCDATETIME(),
  last_error nvarchar(500) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_outbox_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_outbox_due ON dbo.outbox (next_attempt_at, id);
