-- Grupos de trabajo (docs/roadmaps/ROADMAP_COLABORACION.md): cada grupo es un espacio de la plataforma
-- (ecosistema-kit/ESPACIOS.md). La pertenencia es de la plataforma: group_members es la copia del feed
-- (`espacio.*` y `miembro.*`) con la que la API autoriza en local, nunca la fuente. Los proyectos de un
-- grupo son del grupo, no de una cuenta: no cuelgan de dbo.users, así que borrar una cuenta no los borra.

-- external_id es el idExterno que Nodaria da al espacio (grupo-<uuid>); space_id, el id de la plataforma,
-- que llega al crearlo. state: creando (aún sin espacio en la plataforma), activo, borrando (sus
-- proyectos ya se entregaron y falta borrar el espacio) y borrado.
CREATE TABLE dbo.groups (
  id bigint IDENTITY(1, 1) NOT NULL CONSTRAINT PK_groups PRIMARY KEY,
  external_id varchar(120) NOT NULL CONSTRAINT UQ_groups_external_id UNIQUE,
  space_id bigint NULL,
  name nvarchar(200) NOT NULL,
  owner_global_id uniqueidentifier NULL,
  entry varchar(20) NOT NULL CONSTRAINT DF_groups_entry DEFAULT 'invitacion',
  two_step bit NOT NULL CONSTRAINT DF_groups_two_step DEFAULT 0,
  state varchar(20) NOT NULL CONSTRAINT DF_groups_state DEFAULT 'creando'
    CONSTRAINT CK_groups_state CHECK (state IN ('creando', 'activo', 'borrando', 'borrado')),
  created_by uniqueidentifier NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_groups_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_groups_updated_at DEFAULT SYSUTCDATETIME(),
  deleted_at datetime2(3) NULL
);
GO

CREATE UNIQUE INDEX UX_groups_space_id ON dbo.groups (space_id) WHERE space_id IS NOT NULL;
GO

-- Copia del feed: un miembro por cuenta y grupo, con su rol y su estado (solo `activo` tiene acceso).
-- Sin clave ajena a dbo.users: un miembro puede no haber llamado todavía a esta API.
CREATE TABLE dbo.group_members (
  group_id bigint NOT NULL CONSTRAINT FK_group_members_groups REFERENCES dbo.groups (id) ON DELETE CASCADE,
  global_id uniqueidentifier NOT NULL,
  role varchar(40) NOT NULL,
  state varchar(20) NOT NULL,
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_group_members_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_group_members PRIMARY KEY (group_id, global_id)
);
GO

CREATE INDEX IX_group_members_global_id ON dbo.group_members (global_id, group_id);
GO

-- El proyecto compartido: una sola copia en el servidor, con su versión, la cambie quien la cambie.
-- project_id es único entre todos los grupos (el navegador indexa los proyectos por id).
CREATE TABLE dbo.group_projects (
  project_id varchar(100) NOT NULL CONSTRAINT PK_group_projects PRIMARY KEY,
  group_id bigint NOT NULL CONSTRAINT FK_group_projects_groups REFERENCES dbo.groups (id),
  name nvarchar(200) NOT NULL,
  document nvarchar(max) NOT NULL CONSTRAINT CK_group_projects_document CHECK (ISJSON(document) = 1),
  version int NOT NULL CONSTRAINT DF_group_projects_version DEFAULT 1,
  size_bytes int NOT NULL CONSTRAINT DF_group_projects_size_bytes DEFAULT 0,
  updated_at datetime2(3) NOT NULL,
  updated_by uniqueidentifier NULL,
  server_updated_at datetime2(3) NOT NULL CONSTRAINT DF_group_projects_server_updated_at DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_group_projects_group ON dbo.group_projects (group_id);
