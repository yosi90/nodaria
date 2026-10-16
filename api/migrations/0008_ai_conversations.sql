-- Historial del asistente de IA (docs/roadmaps/ROADMAP_IA.md): conversaciones de cada cuenta por
-- proyecto, con sus mensajes. Solo los ve su dueño. Se borran con la cuenta (cascada), al borrar el
-- proyecto (la API) o cuando la persona las borra. project_id no apunta a dbo.projects porque un
-- proyecto puede vivir solo en el navegador.
-- content es JSON: la petición (user), la propuesta con su modelo, uso y lo aplicado (assistant) o el
-- error que se le explicó a la persona (error).
CREATE TABLE dbo.ai_conversations (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ai_conversations PRIMARY KEY,
  user_id bigint NOT NULL
    CONSTRAINT FK_ai_conversations_users REFERENCES dbo.users (id) ON DELETE CASCADE,
  project_id varchar(100) NOT NULL,
  title nvarchar(200) NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_ai_conversations_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_ai_conversations_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_ai_conversations_user_project ON dbo.ai_conversations (user_id, project_id, updated_at DESC);
GO

CREATE TABLE dbo.ai_messages (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ai_messages PRIMARY KEY,
  conversation_id bigint NOT NULL
    CONSTRAINT FK_ai_messages_conversations REFERENCES dbo.ai_conversations (id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CONSTRAINT CK_ai_messages_role CHECK (role IN ('user', 'assistant', 'error')),
  content nvarchar(max) NOT NULL CONSTRAINT CK_ai_messages_content CHECK (ISJSON(content) = 1),
  created_at datetime2(3) NOT NULL CONSTRAINT DF_ai_messages_created_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_ai_messages_conversation ON dbo.ai_messages (conversation_id, id);
