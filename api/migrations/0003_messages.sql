-- Mensajes de los usuarios al propietario (sugerencias, errores, consultas) y su respuesta.
-- La resolución desde el panel de Notificapp guarda la clave de idempotencia y la huella de la
-- respuesta: repetir la misma petición devuelve el resultado previo; otra distinta recibe 409.
CREATE TABLE dbo.messages (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_messages PRIMARY KEY,
  user_id bigint NOT NULL
    CONSTRAINT FK_messages_users REFERENCES dbo.users (id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL
    CONSTRAINT CK_messages_kind CHECK (kind IN ('sugerencia', 'error', 'consulta', 'otro')),
  subject nvarchar(120) NOT NULL,
  body nvarchar(4000) NOT NULL,
  context nvarchar(2000) NULL CONSTRAINT CK_messages_context CHECK (context IS NULL OR ISJSON(context) = 1),
  status varchar(20) NOT NULL CONSTRAINT DF_messages_status DEFAULT 'pendiente'
    CONSTRAINT CK_messages_status CHECK (status IN ('pendiente', 'respondido', 'cerrado')),
  reply nvarchar(4000) NULL,
  replied_at datetime2(3) NULL,
  reply_read_at datetime2(3) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_messages_created_at DEFAULT SYSUTCDATETIME(),
  notificapp_idempotency_key varchar(128) NULL,
  notificapp_request_hash char(64) NULL
);
GO

CREATE INDEX IX_messages_user ON dbo.messages (user_id, created_at DESC);
GO

CREATE INDEX IX_messages_status ON dbo.messages (status, created_at DESC);
GO

-- Cola de avisos a Notificapp. Se inserta en la misma transacción que el mensaje y un
-- drenador en proceso la vacía con reintentos; external_id da idempotencia en Notificapp.
CREATE TABLE dbo.notificapp_outbox (
  external_id varchar(128) NOT NULL CONSTRAINT PK_notificapp_outbox PRIMARY KEY,
  payload nvarchar(max) NOT NULL CONSTRAINT CK_notificapp_outbox_payload CHECK (ISJSON(payload) = 1),
  attempts int NOT NULL CONSTRAINT DF_notificapp_outbox_attempts DEFAULT 0,
  next_attempt_at datetime2(3) NOT NULL CONSTRAINT DF_notificapp_outbox_next DEFAULT SYSUTCDATETIME(),
  last_error nvarchar(500) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_notificapp_outbox_created DEFAULT SYSUTCDATETIME(),
  sent_at datetime2(3) NULL
);
GO

CREATE INDEX IX_notificapp_outbox_pending ON dbo.notificapp_outbox (next_attempt_at) WHERE sent_at IS NULL;
