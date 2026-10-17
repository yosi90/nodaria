-- Comentarios y sugerencias de los proyectos de grupo (docs/roadmaps/ROADMAP_COLABORACION.md, hito 5).
-- Van aparte del documento: quien solo revisa puede comentar sin cambiar el proyecto. Un comentario es
-- del proyecto o de un nodo (node_id); una sugerencia propone el valor de un atributo de un nodo
-- (suggestion, JSON { fieldId, value }) y quien puede editar la acepta o la rechaza. Se borran con el
-- proyecto del grupo (al borrar el grupo, no pasan al proyecto entregado).
CREATE TABLE dbo.group_comments (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_group_comments PRIMARY KEY,
  project_id varchar(100) NOT NULL
    CONSTRAINT FK_group_comments_projects REFERENCES dbo.group_projects (project_id) ON DELETE CASCADE,
  node_id varchar(100) NULL,
  author uniqueidentifier NOT NULL,
  body nvarchar(4000) NOT NULL,
  suggestion nvarchar(max) NULL CONSTRAINT CK_group_comments_suggestion CHECK (suggestion IS NULL OR ISJSON(suggestion) = 1),
  state varchar(20) NOT NULL CONSTRAINT DF_group_comments_state DEFAULT 'abierto'
    CONSTRAINT CK_group_comments_state CHECK (state IN ('abierto', 'resuelto', 'aceptado', 'rechazado')),
  resolved_by uniqueidentifier NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_group_comments_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_group_comments_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_group_comments_project ON dbo.group_comments (project_id, created_at);
