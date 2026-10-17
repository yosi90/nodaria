-- Nombres propios de los roles de cada grupo (docs/roadmaps/ROADMAP_COLABORACION.md, hito 5): JSON
-- { "<rol>": "<nombre>" } que eligen quien tiene la propiedad o el rol responsable. Son solo etiquetas en
-- Nodaria: los permisos son los del rol.
ALTER TABLE dbo.groups ADD role_labels nvarchar(2000) NULL
  CONSTRAINT CK_groups_role_labels CHECK (role_labels IS NULL OR ISJSON(role_labels) = 1);
