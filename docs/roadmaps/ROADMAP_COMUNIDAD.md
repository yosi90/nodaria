# Comunidad: proyectos públicos y novedades de quien sigues

Fecha: 2026-10-19. Estado: **planificado, sin empezar**. No es el roadmap activo principal (lo es [`ROADMAP_CALENDARIO.md`](ROADMAP_CALENDARIO.md)). Las decisiones marcadas como «propuesta» esperan la confirmación del propietario (ver «Preguntas abiertas»).

## Objetivo

Que Nodaria tenga comunidad:

- Cada persona puede declarar **público** un proyecto suyo, siempre **de solo lectura**: nadie más lo edita.
- La gente se **sigue** entre sí y recibe las **actualizaciones** de los proyectos de quienes sigue.

## Qué es de la plataforma y qué es de Nodaria

Según el kit (`ecosistema-kit/SOCIAL.md`, `NOVEDADES.md` y `MODERACION.md`), buena parte ya existe en la plataforma y Nodaria **no debe construirla por su cuenta**:

| Pieza | De quién | Cómo |
| --- | --- | --- |
| Seguir, amistades, bloqueos y búsqueda de personas | Plataforma | Rutas `/v1/personas…` y `/v1/social/…` con el token de la plataforma, o enlace a `social.yosiftware.es`. Nodaria no tiene seguidores propios. |
| Feed de actualizaciones, «me gusta» y comentarios | Plataforma | **Novedades**: el backend de Nodaria las publica con su credencial de servicio y la plataforma decide quién las ve (amistades y seguidores; cualquiera con sesión si el perfil es público), respetando lo que cada persona ha apagado. Nodaria puede enseñar su propio feed con `GET /v1/novedades` y `GET /v1/novedades/descubrir`. |
| Denunciar personas, novedades y comentarios; sanciones | Plataforma | `yosiftware.denunciar(…)` del SDK; la sanción vale en todas las webs. |
| El proyecto público: qué se publica, la página de solo lectura, la lista de públicos de cada persona | **Nodaria** | API y frontend propios (abajo). |
| Denunciar un proyecto público y moderarlo | **Nodaria** | Sus denuncias, su cola y un plugin propio de Notificapp (requisito de adscripción). Avisos o sanciones a la cuenta: `POST /v1/servicio/moderacion/incidentes`. |
| Normas propias de la web | Nodaria las redacta; el propietario las publica | En la administración (`Webs registradas › Nodaria › Normas`); el SDK las enseña y pide aceptarlas. |

Si durante la implementación falta algo de la plataforma (por ejemplo, una ruta para listar a quién sigo filtrada por web), se envía una petición a `C:\Users\Yosi\Desktop\administracion yosiftware\docs\peticiones\`: no se resuelve por cuenta propia.

## Decisiones

- **Publicar es una copia, no el proyecto vivo** (propuesta): «Publicar» sube una **versión publicada** del proyecto (una instantánea), y la persona elige cuándo actualizarla («Publicar los cambios»). Motivos: lo que se está editando a medias no sale solo, el borrador privado sigue siendo privado y la página pública no depende de la sincronización. Alternativa descartada por ahora: publicar automáticamente cada guardado.
- **Solo lectura, sin excepciones**: la página pública enseña el mapa, la Tabla, la Cronología y las fichas sin ningún control de edición. La API no acepta escrituras sobre un público. (¿Se puede copiar? Ver pregunta 2.)
- **Qué se publica** (propuesta): todo el proyecto salvo lo que la persona excluya al publicar: notas de las fichas (por defecto fuera), imágenes y tipos concretos. Nunca salen el historial de la IA, los comentarios del grupo ni los datos de la cuenta.
- **Quién puede publicar** (propuesta): la persona dueña de un proyecto propio y, en un proyecto de grupo, solo la propiedad del grupo. La cuenta con la restricción `creacion` (o `publicacion`) no puede publicar ni actualizar; con `normasPendientes`, tampoco.
- **Novedades** (propuesta), con estos tipos en el catálogo de Nodaria:
  - `proyecto.publicado`: «ha publicado el proyecto «X»», con enlace a la página pública e imagen del mapa (servida por la API de Nodaria).
  - `proyecto.actualizado`: «ha actualizado «X»: 12 nodos y 4 relaciones nuevos». Una como mucho por proyecto y día (`idExterno` `proyecto-<id>-<AAAA-MM-DD>`, que se actualiza si hay más cambios ese día) para no llenar el feed.
  - Al despublicar o borrar el proyecto se retiran sus novedades (`DELETE /v1/servicio/novedades/{idExterno}`).
  - Se publican desde una cola del backend, después de confirmar la transacción y con reintentos.
- **Visibilidad de la página pública** (propuesta): cualquiera con el enlace, también sin sesión, para poder compartirla fuera. Sin sesión no se puede seguir ni comentar.
- **Dónde se ve en Nodaria**: una sección «Comunidad» (fuera de las vistas del proyecto) con «De quienes sigues» (`GET /v1/novedades`), «Descubrir» (`/descubrir` y los públicos recientes de Nodaria) y el perfil de cada persona con sus proyectos públicos y el botón «Seguir» (rutas de la plataforma).

## Fases

### Fase 0 — Preparación con la plataforma

- [ ] Confirmar en la documentación pública de la plataforma (`docs/publica/ENDPOINTS.md`) las rutas de novedades, personas y relaciones, y la credencial de servicio de Nodaria para publicar novedades.
- [ ] Redactar las normas propias de Nodaria para lo público (qué no se puede publicar) para que el propietario las publique.
- [ ] Revisar `LISTA_DE_COMPROBACION.md` por lo que añade tener contenido público (denuncias, plugin de Notificapp, CSP, Yosiftadísticas en la página pública).

### Fase 1 — Publicar un proyecto (API)

- [ ] Migración: `public_projects` (proyecto, cuenta, título, descripción, versión publicada, fecha, opciones de exclusión, estado `publico`/`retirado`) y el documento publicado aparte del privado.
- [ ] Rutas: publicar y actualizar (`PUT /api/proyectos/{id}/publicacion`), despublicar (`DELETE`), leer un público sin sesión (`GET /api/publicos/{id}`), los públicos de una persona y los recientes. Imagen del mapa para la novedad y la vista previa.
- [ ] Reglas: solo quien puede publicar; restricciones y normas pendientes; límites de tamaño como los de la sincronización; nada de escritura sobre lo publicado.
- [ ] Pruebas de la API, también contra SQL Server.

### Fase 2 — Página pública de solo lectura (frontend)

- [ ] Ruta pública (`/p/<id>`) que abre el proyecto publicado con las vistas de solo lectura (mapa, Tabla, Cronología, fichas), sin tocar los proyectos de quien la mira.
- [ ] En el engranaje: «Publicar…» con qué excluir, vista previa, y luego «Publicar los cambios», «Copiar el enlace» y «Dejar de publicar».
- [ ] Metadatos para compartir el enlace (título, descripción e imagen) y el script de Yosiftadísticas en la página pública.

### Fase 3 — Novedades y seguimientos

- [ ] Catálogo de tipos al arrancar la API (`PUT /v1/servicio/novedades/tipos`) y cola de publicación con reintentos (idempotente por `idExterno`).
- [ ] Publicar al publicar, actualizar (una por día) y retirar al despublicar o borrar.
- [ ] Sección «Comunidad»: «De quienes sigues», «Descubrir», el perfil con sus públicos y «Seguir», con «me gusta» y comentarios de la plataforma.
- [ ] Respetar los bloqueos (un 404 de la plataforma es «no hay nadie») y los perfiles privados (`@alias`).

### Fase 4 — Moderación y privacidad

- [ ] «Denunciar» en la página pública y en el perfil: lo de la plataforma con `yosiftware.denunciar`, el proyecto con la denuncia propia de Nodaria.
- [ ] Cola de denuncias de proyectos en un plugin propio de Notificapp, a nombre de Nodaria (retirar el proyecto, desestimar, o registrar un aviso en la plataforma con `incidentes`).
- [ ] Política de privacidad: qué se publica, quién lo ve, novedades y su retirada. Condiciones de uso si hace falta.

**Termina cuando:** una persona publica un proyecto, otra que la sigue ve la novedad en Nodaria y en la web social, abre la página pública sin poder editar nada, la actualización llega como novedad, despublicar lo retira todo y una denuncia llega a Notificapp y se resuelve. Lint, build, pruebas de front y API, Edge en producción y la lista de comprobación del kit cumplida.

## Preguntas abiertas

1. ¿Publicar una copia que se actualiza a mano (recomendado) o publicar el proyecto vivo, con cada guardado?
2. ¿Quien ve un proyecto público puede **copiarlo** a sus proyectos (una copia propia e independiente, con la autoría citada), o ni eso?
3. ¿La página pública se ve sin sesión, con el enlace (recomendado), o solo con sesión?
4. ¿Las notas de las fichas salen por defecto fuera de lo publicado (recomendado)?
5. ¿Se pueden publicar los proyectos de un grupo (solo la propiedad del grupo), o de momento solo los propios?

## Criterios de finalización

- Los proyectos públicos son de solo lectura en la interfaz y en la API.
- Seguir, el feed, los «me gusta» y los comentarios son los de la plataforma; Nodaria no guarda relaciones sociales propias.
- Las novedades respetan lo que cada persona ha apagado, no llevan datos privados y se retiran con el proyecto.
- La moderación de lo público funciona de punta a punta, con su plugin de Notificapp.
- Documentación (`PROJECT_CONTEXT.md`, `docs/backend/README.md`) y política de privacidad actualizadas.
