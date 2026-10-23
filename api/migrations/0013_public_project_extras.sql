-- Proyectos públicos, segunda tanda (docs/roadmaps/ROADMAP_COMUNIDAD.md): la imagen del mapa que acompaña
-- a la novedad y a la vista previa del enlace (PNG o JPEG, la dibuja el navegador al publicar), de dónde se
-- copió el proyecto (para citar la autoría, JSON) y, si es de un grupo, cuál (solo lo publica su propiedad).
ALTER TABLE dbo.public_projects ADD
  image varbinary(max) NULL,
  origin nvarchar(1000) NULL CONSTRAINT CK_public_projects_origin CHECK (origin IS NULL OR ISJSON(origin) = 1),
  group_id varchar(120) NULL;
