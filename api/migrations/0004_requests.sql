-- Peticiones de los usuarios: ideas (tablón público con votos, tras la revisión del propietario)
-- y avisos de error (siempre privados). Sustituye a dbo.messages, que nunca llegó a usarse.
-- Estados: revision y rechazada nunca son públicos; una idea en cualquier otro estado sí.
DROP TABLE dbo.messages;
GO

CREATE TABLE dbo.requests (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_requests PRIMARY KEY,
  user_id bigint NOT NULL
    CONSTRAINT FK_requests_users REFERENCES dbo.users (id) ON DELETE CASCADE,
  kind varchar(10) NOT NULL CONSTRAINT CK_requests_kind CHECK (kind IN ('idea', 'error')),
  title nvarchar(120) NOT NULL,
  body nvarchar(4000) NOT NULL,
  status varchar(20) NOT NULL CONSTRAINT DF_requests_status DEFAULT 'revision'
    CONSTRAINT CK_requests_status CHECK (
      status IN ('revision', 'rechazada', 'abierta', 'planificada', 'en_curso', 'hecha', 'descartada', 'duplicada')
    ),
  -- Sin FK: al borrar una cuenta se limpia a mano (SQL Server no admite la cascada en bucle).
  duplicate_of bigint NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_requests_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_requests_updated_at DEFAULT SYSUTCDATETIME(),
  -- Última vez que el autor vio las respuestas; las posteriores cuentan como no leídas.
  author_read_at datetime2(3) NULL,
  CONSTRAINT CK_requests_duplicate CHECK ((status = 'duplicada') OR duplicate_of IS NULL)
);
GO

CREATE INDEX IX_requests_user ON dbo.requests (user_id, created_at DESC);
GO

CREATE INDEX IX_requests_public ON dbo.requests (kind, status, created_at DESC);
GO

-- Respuestas del propietario (desde el panel de Notificapp): estado y mensaje público opcional.
-- La clave de idempotencia y la huella permiten repetir la misma respuesta sin duplicarla.
CREATE TABLE dbo.request_updates (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_request_updates PRIMARY KEY,
  request_id bigint NOT NULL
    CONSTRAINT FK_request_updates_requests REFERENCES dbo.requests (id) ON DELETE CASCADE,
  status varchar(20) NOT NULL,
  message nvarchar(2000) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_request_updates_created_at DEFAULT SYSUTCDATETIME(),
  idempotency_key varchar(128) NULL,
  request_hash char(64) NULL
);
GO

CREATE INDEX IX_request_updates_request ON dbo.request_updates (request_id, created_at);
GO

CREATE UNIQUE INDEX UX_request_updates_idempotency
  ON dbo.request_updates (idempotency_key) WHERE idempotency_key IS NOT NULL;
GO

-- Un voto por usuario e idea. La FK a users no lleva cascada (ya hay otra ruta por requests):
-- el borrado de la cuenta elimina antes sus votos.
CREATE TABLE dbo.request_votes (
  request_id bigint NOT NULL
    CONSTRAINT FK_request_votes_requests REFERENCES dbo.requests (id) ON DELETE CASCADE,
  user_id bigint NOT NULL CONSTRAINT FK_request_votes_users REFERENCES dbo.users (id),
  created_at datetime2(3) NOT NULL CONSTRAINT DF_request_votes_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_request_votes PRIMARY KEY (request_id, user_id)
);
GO

CREATE INDEX IX_request_votes_user ON dbo.request_votes (user_id);
