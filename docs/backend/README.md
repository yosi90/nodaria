# Backend de Nodaria

API Node/TypeScript (Fastify) en `api/`. Valida los tokens de la **cuenta de Yosiftware** (la plataforma común, `ecosistema-kit/`) y guarda los proyectos en SQL Server Express local. Se publica por Cloudflare Tunnel en `nodaria-api.yosiftware.es`; la web se sirve desde Firebase Hosting (`yosiftware-nodaria`). La migración desde Firebase Authentication está en [ROADMAP_MIGRACION_YOSIFTWARE.md](../roadmaps/ROADMAP_MIGRACION_YOSIFTWARE.md).

## Requisitos

- Node 24+.
- SQL Server Express (`localhost\SQLEXPRESS`) con autenticación de Windows.
- ODBC Driver 18 for SQL Server (lo usa el driver nativo `msnodesqlv8`).
- La credencial de servicio de Nodaria en la plataforma de su entorno (solo el token, en `api/.runtime/`, fuera de Git). La de QA la da la plataforma; la de producción la crea y la pega el propietario. Nunca se abre, imprime ni copia en una conversación.

La API se conecta con la identidad del proceso que la ejecuta (`Trusted_Connection`), igual que Lorcana, Libros y Fichas. No hay usuario ni contraseña SQL en la configuración.

## Puesta en marcha

```powershell
cd api
npm ci
copy .env.example .env      # producción: PLATFORM_ENV=produccion
npm run migrate             # crea la base si no existe y aplica migrations/*.sql
npm run dev                 # http://127.0.0.1:5003/api/health
```

npm 11 bloquea los scripts de instalación salvo los aprobados en `allowScripts` de `api/package.json`. Si al actualizar una dependencia cambia su versión, apruébala con `npm approve-scripts <paquete>` y ejecuta `npm rebuild <paquete>`.

### Desarrollo contra la plataforma de QA

Separado de producción (`ecosistema-kit/MIGRACION.md`, paso 7):

- **API**: `api/.env.dev` (ignorado): puerto `5013`, base `NodariaDev`, `PLATFORM_ENV=qa`, credencial `.runtime/plataforma-qa.token`, logs en `logs-dev` (que también separa el archivo de reinicio de `ops/restart-api.ps1`). `npx tsx --env-file=.env.dev src/server.ts` o `npm run dev:qa`; migrar con `npx tsx --env-file=.env.dev src/db/migrate.ts`.
- **Web**: `npm run dev:qa` (Vite) o `npm run preview:qa` (build de QA con su CSP), en `https://nodaria.dev.yosiftware.es` (`127.0.0.13:443`, certificado comodín de la plataforma; rutas en `.env.qa.local`). La API va por el proxy `/api`. Desde `localhost` no se puede entrar.
- **Prueba de humo**: `node ops/qa-smoke.mjs` pide tokens reales con las sesiones de las cuentas de prueba de QA (`.runtime/cuentas-prueba-qa.json`, privado; guarda el `refresh` nuevo antes de usar los tokens) y comprueba cada caso. No imprime tokens.

## Configuración (`api/.env`)

| Variable                       | Por defecto                     | Uso                                                                      |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| `HOST` / `PORT`                | `127.0.0.1` / `5003`            | Solo escucha en local; el túnel publica el puerto.                       |
| `DB_SERVER`                    | `localhost\SQLEXPRESS`          | Instancia de SQL Server.                                                 |
| `DB_NAME`                      | `Nodaria`                       | Base de datos (solo letras, números y `_`).                              |
| `DB_DRIVER`                    | `ODBC Driver 18 for SQL Server` | Driver ODBC.                                                             |
| `CORS_ORIGINS`                 | –                               | Orígenes web permitidos, separados por comas.                            |
| `PLATFORM_ENV`                 | `produccion`                    | Entorno de la plataforma: emisor de los tokens y API del feed.           |
| `PLATFORM_AUDIENCE`            | `nodaria-api`                   | Audiencia de esta API en el registro de la plataforma.                   |
| `PLATFORM_SERVICE_TOKEN_FILE`  | `.runtime/plataforma.token`     | Credencial de servicio (solo el token) para el feed de cambios.          |
| `PLATFORM_FEED_INTERVAL_MS`    | `300000`                        | Cada cuánto se lee el feed (no hay NATS).                                |
| `UV_THREADPOOL_SIZE`           | `4` (Node)                      | Hilos de libuv; `msnodesqlv8` ocupa uno por consulta. Usar `16`.         |
| `PUBLIC_WEB_URL`               | `https://nodaria.yosiftware.es` | Dirección de la web para el enlace de las páginas públicas (`/p/<id>`).  |
| `PUBLIC_API_URL`               | `https://nodaria-api.yosiftware.es` | Dirección pública de esta API: imagen de los públicos y enlace con vista previa. |
| `NOTIFICAPP_API`               | `https://notificapp-api.yosiftware.es` | API de Notificapp para los avisos de denuncias.                   |
| `NOTIFICAPP_SENDER_TOKEN_FILE` | `.runtime/notificapp-sender.token` | Credencial de emisor del plugin `nodaria-api` (sin ella, los avisos esperan en la cola). |
| `NOTIFICAPP_UPSTREAM_TOKEN_FILE` | `.runtime/notificapp-upstream.token` | Credencial externa con la que Notificapp llama a `/notificapp/v1/*` (sin ella, 401). |
| `OUTBOX_INTERVAL_MS`           | `30000`                         | Cada cuánto se vacía la cola de salida (novedades y avisos).             |
| `LOG_DIR`                      | –                               | Logs diarios rotados (vacío: salida estándar).                           |

## Autenticación

Las rutas privadas reciben `Authorization: Bearer <token de la plataforma>` (el frontend lo pide al SDK con `yosiftware.token()`). La API lo valida en local con la implementación de referencia del kit (`src/auth/yosiftware-tokens.mjs`, con `jose`): solo ES256, claves del JWKS del emisor, emisor exacto del entorno, audiencia `nodaria-api` y caducidad. El `sub` se valida como GUID (no como UUID del RFC). Después busca o crea el usuario por `id_global` y lo deja en `request.user`.

| Código              | HTTP | Cuándo                                                                                       |
| ------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `no_autenticado`    | 401  | Sin token, o token de otra API, de otro emisor, manipulado o con un `sub` que no es un GUID. |
| `token_caducado`    | 401  | Token caducado: el SDK pide otro y repite.                                                   |
| `cuenta_cerrada`    | 403  | La plataforma avisó por el feed de que la cuenta está cerrada (borrado pedido o suspensión). |
| `cuenta_desactivada`| 403  | `disabled_at` en SQL.                                                                        |
| `normas_pendientes` | 403  | El token trae `normasPendientes` (solo responde `/api/me`).                                  |
| `creacion_limitada` | 403  | `PUT /api/projects/{id}` de un proyecto nuevo con `creacion` limitada; lleva `hasta`.         |

Para nuevas rutas privadas, regístralas dentro del bloque de rutas privadas de `src/app.ts` y obtén el usuario con `authenticatedUser(request)`. Para crear contenido nuevo, llama antes a `assertCanCreate(user)` (o a `assertUnrestricted` con otros alcances, como publicar).

Piezas comunes que no hay que repetir (auditoría de duplicados, 2026-10-25):

- Toda llamada a la plataforma o a Notificapp pasa por `src/platform/http.ts`: `platformRequest` (rutas de servicio con la credencial de servicio; sin ella, `PlatformError` 503 `sin_credencial`), `serviceRequest` (otra credencial), `readToken`, `PlatformError` y `USER_AGENT`. Para avisar por el canal de un grupo, `announceInChannel` (`src/platform/spaces.ts`).
- Lo que se repite cada cierto tiempo y se puede pedir a mano (feed, mantenimiento de grupos, cola de salida) usa `createPeriodicTask` (`src/periodic.ts`).
- Un documento de proyecto se comprueba con `assertDocumentId` y `serializeDocument` (`src/routes/projects.ts`); el GUID de una cuenta, con `GUID` (`src/auth/platform.ts`); el `Bearer`, con `bearerToken` (`src/auth/plugin.ts`). En SQL, `guid` y `prefixed` (`src/db/pool.ts`) y, para los proyectos, `appliedWrite` y `SOFT_DELETE_SET` (`src/projects/repository.ts`); para los públicos, `selectPublications` (`src/community/repository.ts`).
- Un límite de peticiones que se ha pasado se comprueba con `overLimit` (`src/rateLimit.ts`), que pone `Retry-After`.
- **Lo que la web copia** (no comparten paquete): los esquemas de la IA (`src/ai/schema.ts`, con `refsSchema` y los topes `AI_CONTEXT_BUDGET`, `AI_BODY_LIMIT` y `AI_INSTRUCTION_MAX`; `src/ai/world.ts`) y las constantes con nombre (`PROJECT_NAME_MAX`, `PUBLIC_DESCRIPTION_MAX`, `REPORT_TEXT_MAX`, `REPORT_REASONS`, `PUBLIC_ID`, `ROLES`, `GROUP_NAME_MAX`, `ROLE_LABEL_MAX`, `COMMENT_MAX`, `SCHEMA_KEYS`). Si cambias una, cambia su copia en la web: la prueba de `contracts/` (en la raíz, `npm test`) falla si no coinciden.

## Feed de cambios

`src/platform/feed.ts` lee `GET /v1/servicio/cambios` con la credencial de servicio y `User-Agent: nodaria-api/1.0`, hasta ponerse al día, cada `PLATFORM_FEED_INTERVAL_MS`. Usa `cuenta.estado`: `cerrada` marca `closed_at`, `activa` lo quita, `borrada` borra el usuario y sus proyectos propios (los de sus grupos son del grupo y no se tocan); guarda lo limitado (`restrictions`, `restrictions_until`). Y los cambios de los espacios (`espacio.*`, `miembro.*`), que ponen al día la copia de los grupos (ver «Grupos de trabajo»). Ignora perfiles y relaciones (Nodaria no los enseña). `POST /api/grupos/actualizar` lo lee a petición. El cursor está en `dbo.platform_feed` (`feed_cursor`) y se guarda en la misma transacción que los cambios.

## Órdenes de la migración

```powershell
npm run enlazar-cuenta -- <id local> <identificador de la cuenta de Yosiftware>
```

Con `--env-file=.env.dev` se ejecutan contra la base de desarrollo (`npx tsx --env-file=.env.dev src/tools/cli.ts …`). Cada orden escribe una línea JSON con la base, el resultado y la fecha.

- `enlazar-cuenta`: idempotente (`linked`, `unchanged`). Si la persona entró antes de enlazar y la API le creó un usuario vacío, mueve el identificador al antiguo y borra el vacío (`moved`); si ese usuario tiene proyectos, no toca nada (`taken_by_other`). No reasigna un usuario ya enlazado con otra cuenta (`already_linked`).

## Migraciones

- Archivos `api/migrations/NNNN_descripcion.sql`, aplicados en orden; cada archivo en una transacción y lotes separados por una línea `GO`.
- `dbo.schema_migrations` guarda id y SHA-256 de cada migración aplicada. Si se edita una ya aplicada, `migrate` falla: hay que crear una nueva.
- `0006_platform_identity`: `id_global` (único filtrado), `firebase_uid` opcional (único filtrado), `closed_at`, lo limitado y `platform_feed`.
- `0009_groups`: `groups`, `group_members` y `group_projects` (grupos de trabajo).
- `0011_group_role_labels`: `groups.role_labels` (nombres propios de los roles, JSON).
- `0010_group_comments`: `group_comments` (comentarios y sugerencias de los proyectos de grupo; se borran con el proyecto del grupo).
- `0012_public_projects`: `public_projects`, `public_news`, `public_reports` y `outbox` (proyectos públicos, sus novedades, sus denuncias y la cola de salida).
- `0013_public_project_extras`: en `public_projects`, `image` (la imagen del mapa), `origin` (JSON: de qué público se copió) y `group_id` (el grupo, si lo publicó su propiedad).

## Modelo de datos

| Tabla            | Clave                               | Contenido                                                                                       |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users`          | `id` (`id_global` único si no nulo) | Ancla de los proyectos de cada cuenta. `firebase_uid` solo en las cuentas de antes de migrar.  |
| `projects`       | `(user_id, project_id)`             | Un documento JSON por proyecto, con `version`, `updated_at` y borrado lógico.                   |
| `platform_feed`  | `id` = 1                            | Cursor del feed de cambios.                                                                     |
| `ai_conversations` | `id` (por `user_id` y `project_id`) | Conversaciones del asistente de IA de cada cuenta y proyecto, con título y fechas.             |
| `ai_messages`    | `id` (por `conversation_id`)        | Mensajes: `role` `user`, `assistant` o `error` y su `content` en JSON.                          |
| `groups`         | `id` (`external_id` y `space_id` únicos) | Grupos de trabajo: el espacio de la plataforma (`grupo-<uuid>`), su nombre, propietario y estado (`creando`, `activo`, `borrando`, `borrado`). |
| `group_members`  | `(group_id, global_id)`             | Copia del feed de los miembros: rol y estado (solo `activo` tiene acceso). Sin clave ajena a `users`. |
| `group_projects` | `project_id` (único entre grupos)   | El proyecto del grupo: documento, `version`, `updated_by`. No cuelga de ninguna cuenta.         |
| `public_projects` | `id` (público, 12 caracteres; único por `(user_id, project_id)`) | La copia publicada de un proyecto propio: documento, recuentos, opciones, `allow_copy`, `state` (`publico` o `retirado`) y `version`. |
| `public_news`    | `external_id`                       | Las novedades publicadas de cada público, para retirarlas todas.                                 |
| `public_reports` | `id` (único por `(public_id, reporter)`) | Denuncias de proyectos públicos: motivo, texto, `state` (`pendiente`, `retirado`, `desestimado`) y nota. |
| `outbox`         | `id`                                | Cola de salida: `channel` (`novedades`, `notificapp`), `operation`, `external_id`, `payload`, reintentos. |

`projects` y `ai_conversations` cuelgan de `users` con `ON DELETE CASCADE`, y `ai_messages` de `ai_conversations`; borrar un proyecto borra sus conversaciones desde la API. El antiguo tablón (`requests`, `request_updates`, `request_votes`) y `notificapp_outbox` se retiraron con `0007_drop_request_board` tras importarlo la plataforma. Las columnas `email`, `display_name` y `photo_url` ya no se escriben.

## Endpoints

| Método | Ruta                 | Auth | Descripción                                                                                                                       |
| ------ | -------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`        | No   | Estado de la API y de la base de datos (503 si la base falla).                                                                   |
| GET    | `/api/me`            | Sí   | Usuario de Nodaria: `id`, `globalId`, `legacyAccount` (UID de Firebase de antes, para la sincronización), restricciones y normas. |
| DELETE | `/api/me`            | Sí   | Borra los datos de Nodaria de la cuenta (el usuario local y sus proyectos). La cuenta se borra en la web social.                  |
| GET    | `/api/projects`      | Sí   | Resumen de los proyectos de la cuenta (id, nombre, `version`, `updatedAt`, `deletedAt`, tamaño), borrados incluidos.             |
| GET    | `/api/projects/{id}` | Sí   | Documento completo con su versión. 404 `project_not_found` o `project_deleted`.                                                  |
| PUT    | `/api/projects/{id}` | Sí   | `{ document, baseVersion }`: crea (`baseVersion` 0) o actualiza. 409 `version_conflict`; 413; 400; 403 `creacion_limitada`.       |
| DELETE | `/api/projects/{id}` | Sí   | Borrado lógico; `?baseVersion=n` opcional para exigir la versión. Idempotente sobre un borrado.                                  |
| GET    | `/api/ia/modelos`    | Sí   | Modelos que ofrece el asistente de IA (`api/src/ai/models.ts`) y `manageUrl`, la gestión de claves de la web social del entorno. |
| POST   | `/api/ia/propuestas` | Sí   | `{ provider, model, scope: "base-de-datos", instruction, context, projectId, conversationId?, refs }` → `{ conversationId, userMessageId, messageId, proposal, model, usage }`. Ver «Asistencia de IA». |
| POST   | `/api/ia/preguntas` | Sí   | `{ provider, model, question, context, projectId, conversationId?, refs, keySource? }` → `{ conversationId, userMessageId, messageId, answer, model, usage, refs }`. Pregunta sobre el mundo (`api/src/ai/world.ts`): mismas reglas que las propuestas (cuenta, límite, clave del grupo, conversación); cuerpo hasta 2 MiB; `refs` de vuelta solo con los nodos citados. |
| GET    | `/api/ia/conversaciones?proyecto=` | Sí | Las 50 conversaciones más recientes de la cuenta en ese proyecto.                                                  |
| GET    | `/api/ia/conversaciones/{id}` | Sí | Una conversación con sus mensajes (los 200 últimos). 404 si no es de la cuenta.                                       |
| DELETE | `/api/ia/conversaciones/{id}` | Sí | Borra la conversación y sus mensajes.                                                                                |
| PATCH  | `/api/ia/mensajes/{id}` | Sí | `{ applied: number[] }`: apunta qué operaciones de una propuesta se aplicaron.                                           |
| GET    | `/api/grupos`        | Sí   | Grupos activos de la cuenta: `id`, `spaceId`, `name`, `owner`, `role`, `memberState`, `isOwner`, `capabilities`, `projects`. |
| POST   | `/api/grupos/actualizar` | Sí | Lee el feed ya y devuelve la lista (tras aceptar una invitación o cambiar un rol).                                     |
| POST   | `/api/grupos`        | Sí   | `{ id, name, document }`: crea el grupo y su espacio y hace del documento el proyecto del grupo. Ver «Grupos de trabajo». |
| GET    | `/api/grupos/{grupo}/proyectos/{id}` | Sí | Documento del proyecto del grupo con su versión (miembro activo).                                         |
| PUT    | `/api/grupos/{grupo}/proyectos/{id}` | Sí | `{ document, baseVersion }` (con `edit`). 409 `version_conflict` con la vigente; 403 `sin_permiso_en_el_grupo` o `cambio_de_esquema_no_permitido`. |
| POST   | `/api/grupos/{grupo}/conversacion` | Sí | Miembro activo: `{ id }` de la conversación del grupo en el chat de la plataforma (la crea la primera vez). 424 si la plataforma falla. |
| PUT    | `/api/grupos/{grupo}/nombres-de-rol` | Sí | `{ labels }` (`{ responsable?, editor?, revisor?, lector? }`, hasta 40 caracteres, o `null`): nombres propios de los roles del grupo. Propiedad o responsable. Solo etiquetas. |
| GET/POST | `/api/grupos/{grupo}/proyectos/{id}/comentarios` | Sí | Comentarios del proyecto del grupo (leer: miembro activo; crear: capacidad `comment`). `{ nodeId?, body, suggestion?: { fieldId, value } }`; una sugerencia necesita `nodeId`. |
| PATCH/DELETE | `/api/grupos/{grupo}/proyectos/{id}/comentarios/{comentario}` | Sí | `{ state }`: resolver o reabrir (autor o quien edita), aceptar o rechazar sugerencias (quien edita). Borrar: autor o propiedad. |
| DELETE | `/api/grupos/{grupo}?recipient=` | Sí | Solo la propiedad: el proyecto pasa a la cuenta elegida y se borra el espacio. `{ id, state: borrado \| borrando }`. |

| GET    | `/api/projects/{id}/publicacion` | Sí | `{ publicacion }`: la publicación propia del proyecto (con `url`, opciones y estado) o `null`. |
| PUT    | `/api/projects/{id}/publicacion` | Sí | `{ document, description, options: { notes, images, excludedTypeIds }, allowCopy }`: publica o publica los cambios. Ver «Proyectos públicos». |
| DELETE | `/api/projects/{id}/publicacion` | Sí | Deja de publicar (también lo retirado) y encola la retirada de sus novedades. 404 `sin_publicar`. |
| GET    | `/api/publicaciones` | Sí   | `{ publicaciones }`: lo que ha publicado la cuenta.                                                                              |
| GET    | `/api/publicos?cuenta=&limite=` | No | `{ publicos }`: los públicos visibles más recientes (de una cuenta, si se pide), sin documento ni proyecto privado.   |
| GET    | `/api/publicos/{id}` | No   | Un público con su documento. 404 `publico_no_encontrado` si no existe, se retiró o la cuenta está cerrada.                      |
| GET    | `/api/publicos/{id}/imagen` | No | La imagen del mapa (PNG o JPEG), con caché de 5 minutos; la dirección lleva `?v=<versión>`. 404 si no hay o no es visible. |
| GET    | `/compartir/{id}`    | No   | Página mínima con los metadatos Open Graph (título, descripción, imagen) que lleva a la página pública: el enlace con vista previa. |
| POST   | `/api/publicos/{id}/denuncias` | Sí | `{ motivo, texto? }` → 201 `{ id }`. 400 `denuncia_propia`, 409 `denuncia_repetida`, 404 `publico_no_encontrado`.        |
| GET    | `/notificapp/v1/reports`, `…/reports/{id}`, `…/cases` | Notificapp | Panel de moderación del plugin (ver «Proyectos públicos»). |
| POST   | `/notificapp/v1/reports/{id}/retire` y `…/dismiss` | Notificapp | Retirar el proyecto (con aviso opcional a la cuenta) o desestimar la denuncia. Idempotentes. |

El documento es el `Project` del front tal cual (JSON); la API solo comprueba id, nombre, `updatedAt` y las tres listas. El control de versión es optimista.

Errores con formato `{ "error": "<codigo>", "message": "<texto en español>" }`. Límite general de 300 peticiones/minuto por IP (`CF-Connecting-IP` detrás del túnel) y 120 por usuario autenticado.

## Grupos de trabajo

Cada grupo es un espacio de la plataforma (`ecosistema-kit/ESPACIOS.md`); el plan está en `docs/roadmaps/ROADMAP_COLABORACION.md` («Contrato del hito 1»). Código en `src/groups/` (reglas en `model.ts`, almacén SQL y en memoria en `repository.ts`, mantenimiento en `maintenance.ts`), `src/routes/groups.ts` y `src/platform/spaces.ts`.

- **La pertenencia es de la plataforma.** `group_members` es la copia del feed con la que se autoriza; invitar, aceptar, salir y cambiar roles los hace la persona desde el frontend con el SDK. La API declara los roles (`responsable`, `editor`, `lector` por defecto) al arrancar con el feed activo y los repite hasta que la plataforma los acepta; si al crear responde `sin_roles`, los declara y repite.
- **Capacidades** (`capabilitiesOf`): solo los miembros `activo`; la propiedad, todo; responsable, editar y cambiar el esquema; editor, editar sin cambiar el esquema; lector o rol desconocido, leer.
- **Crear** (`POST /api/grupos`): el nombre, de 1 a 150 caracteres (el límite del nombre de un espacio, kit 1.39). Apunta el grupo (`creando`), crea el espacio con `X-Yosi-Cuenta` y el rol `responsable`, y mete el documento como proyecto del grupo; la copia personal queda borrada. Idempotente por `id`. Los fallos de la plataforma responden `424 plataforma_no_disponible`.
- **Proyecto propio con el id de un grupo**: `PUT /api/projects/{id}` responde `409 proyecto_compartido` (`group`) si la cuenta es miembro de ese grupo.
- **Clave de IA del grupo:** `POST /api/ia/propuestas` en un proyecto del grupo (miembro activo) llama a la pasarela con `X-Yosi-Espacio`; `keySource: 'personal'` usa la clave de la persona. Errores del grupo: `sin_clave_del_grupo` y `tope_del_grupo` (409/429), `proveedor_no_permitido`, `modelo_no_permitido` y `espacio_no_disponible` (403). La respuesta lleva `keySource`.
- **Canal del espacio** (hito 3): tras guardar el proyecto del grupo, la API publica `{ tipo: 'proyecto', id, version, por }` (`idExterno` `<proyecto>-v<versión>`); tras aplicar cambios de pertenencia del feed, `{ tipo: 'grupo' }` (`miembros-<id del cambio>`). Solo referencias: el frontend baja el documento de esta API. Un fallo al publicar se registra y lo recoge el sondeo del frontend.
- **Borrar** (`DELETE /api/grupos/{grupo}?recipient=`): solo la propiedad; el proyecto pasa a la cuenta elegida (miembro activo) y se borra el espacio. Si la plataforma falla, el grupo queda `borrando` y el mantenimiento lo termina con el ritmo del feed.

## Proyectos públicos

Plan y decisiones en `docs/roadmaps/ROADMAP_COMUNIDAD.md`. Código en `src/community/` (reglas en `model.ts`, almacén SQL y en memoria en `repository.ts`, cola en `outbox.ts`), `src/routes/community.ts` y `src/platform/community.ts`.

- **Publicar** (`PUT /api/projects/{id}/publicacion`) guarda una copia de solo lectura del documento que manda el navegador, ya sin lo que la persona dejó fuera (`src/domain/publication.ts`). Un proyecto propio que la cuenta ya tiene sincronizado (404 `project_not_found` si no) o, si es de un grupo, solo su propiedad (403 `solo_la_propiedad`) y con el proyecto del grupo en el servidor, hasta `PROJECT_MAX_BYTES` (413). `image` (opcional): la imagen del mapa en `data:` (PNG o JPEG de hasta 1 MB, se comprueba la firma; 400 `imagen_no_valida`); sin ella se conserva la anterior. `document.origin` (si es una copia) se guarda aparte y sale en los resúmenes. Las respuestas propias llevan `url`, `shareUrl` e `imageUrl`; las públicas, `imageUrl` y `origin`, nunca `projectId` ni `groupId`. Con `creacion`, `publicacion` o `comunidad` limitadas, 403 `publicacion_limitada` (con `hasta`); con normas pendientes, 403 como todo lo privado. Uno retirado por moderación no se actualiza (409 `publicacion_retirada`); dejar de publicarlo lo borra. Nadie más escribe en un público: no hay ruta para ello.
- **Novedades** (`ecosistema-kit/NOVEDADES.md`): catálogo `proyecto.publicado` y `proyecto.actualizado`, que la cola declara al arrancar hasta que la plataforma lo acepta. Publicar encola `proyecto-<id>`; publicar los cambios, `proyecto-<id>-<AAAA-MM-DD>` (una al día, que se corrige si se vuelve a publicar ese día), o la misma `proyecto-<id>` si es del día de la publicación. Texto en tercera persona sin el nombre, con el enlace `PUBLIC_WEB_URL/p/<id>`. Dejar de publicar, retirar o borrar el proyecto encola la retirada de todas (`public_news`). `publicada: false` no se reintenta.
- **Cola de salida** (`outbox`): se escribe en la misma transacción que el cambio y la vacía `createOutboxWorker` cada `OUTBOX_INTERVAL_MS`, en orden. Reintentos a 1 min, 5 min, 30 min y cada 2 h; un 4xx que no sea 401 ni 429 se descarta con un aviso en el registro. Encolar algo de la misma cosa sustituye a lo que quedaba por mandar.
- **Denuncias** (`POST /api/publicos/{id}/denuncias`): una por persona y proyecto, nunca del propio. Cada una encola un aviso `nodaria_report` a Notificapp (`externalId` `report-<id>`, con `data: { report, publicId }`). Sin la credencial de emisor, el aviso espera en la cola.
- **Plugin de Notificapp** (`notificapp-plugin/`, id `nodaria-api`, versión 2.0.0, a nombre de Nodaria): lista las denuncias, su detalle y los casos de la plataforma, y resuelve. `retire` (`onSuccess: answered`) retira el proyecto, resuelve con él las demás pendientes, retira sus novedades y, si se elige un caso y un mensaje, registra un aviso a la cuenta en la plataforma (`POST /v1/servicio/moderacion/incidentes`, `idExterno` `report-<id>`). `dismiss` (`onSuccess: deleted`) la desestima. Repetir una acción no cambia nada más. Empaquetar: `python plugin-kit/pack.py --template notificapp-plugin --output api/.runtime/nodaria-api-<versión>.notificapp.zip`. Como cambia `eventKinds` y `api`, no se publica en remoto: el propietario lo instala o lo sube con `plugin_cli install` o `upgrade`, le configura la credencial externa (`plugin_cli set-upstream-token nodaria-api <ruta a api/.runtime/notificapp-upstream.token>`) y la credencial de emisor se copia a `api/.runtime/notificapp-sender.token` sin mostrarla.

## Asistencia de IA

`POST /api/ia/propuestas` (`api/src/routes/ai.ts`) llama al proveedor a través de la **pasarela de IA de la plataforma** (`ecosistema-kit/CLAVES_DE_IA.md`) con la credencial de servicio de `PLATFORM_SERVICE_TOKEN_FILE` y la cuenta que actúa (`sub`) en `X-Yosi-Cuenta`: la plataforma pone la clave de la persona y Nodaria nunca la ve. Usa los SDK oficiales `@anthropic-ai/sdk@0.132.1` (Messages en streaming) y `openai@7.30.1` (Responses, `store: false`), con la dirección base de la pasarela, salida estructurada con el esquema de `api/src/ai/schema.ts`, sin reintentos y con 9 minutos de espera (`api/src/ai/assistant.ts`).

- El navegador manda el contexto mínimo del esquema (`src/domain/aiContext.ts`); la API no lee el proyecto. Con `creacion` limitada, 403 `creacion_limitada`.
- **Guardarraíles** (kit 1.58, `CLAVES_DE_IA.md`, «Lo que escribe la persona», y lo que el propietario dejó a criterio de Nodaria el 2026-10-25). Iguales en propuestas y preguntas (`POST /api/ia/preguntas`), y cada uno con su prueba:
  - **Tamaño, comprobado antes de llamar:** cuerpo hasta 640 KiB (la web deja 600 KiB para el contexto y sus referencias); petición o pregunta hasta 4000 caracteres; el contexto, hasta 400 000 caracteres de JSON (`AI_CONTEXT_BUDGET`) y, por encima, 413 `contexto_demasiado_grande`; topes por campo en `contextSchema` y `worldContextSchema`. La web recorta lo que es texto libre y avisa de lo demás antes de mandar (`databaseContextProblem`).
  - **Uso:** 10 llamadas por minuto y 300 al día por cuenta (en memoria), además del límite general y del tope de gasto de la plataforma. Salida hasta 32 000 tokens en propuestas y 12 000 en respuestas.
  - **Instrucciones aparte:** las de Nodaria van en el mensaje de sistema; lo de la persona y el contexto, en el de usuario, entre etiquetas y con `<` escapado en el JSON (`contextJson`). El contexto son datos, no órdenes, y así lo dicen las instrucciones.
  - **Ámbito:** el asistente solo ayuda con el proyecto (una petición ajena da una propuesta sin operaciones o una respuesta que lo explica) y no revela ni resume sus instrucciones.
  - **Nada que sacar y ningún poder:** el contexto es solo el proyecto abierto, que la persona puede ver, sin las filas de las tablas, y la agenda solo con su permiso. Sin herramientas. La salida se valida con zod y con límites, la web la pinta como texto (nunca HTML) y una propuesta no se aplica sin que la persona la marque.
  - **Clave del grupo (decisión del propietario, 2026-10-25):** las preguntas con ella exigen la capacidad `comment` (propiedad, responsable, editor y revisor) y las propuestas, `editSchema` (propiedad y responsable). Sin ella, 403 `clave_del_grupo_no_permitida` sin llamar; con `keySource: personal` se usa la clave de la persona. Un rol desconocido cuenta como lector. El panel dice siempre con qué clave se manda.
  - **Almacenamiento:** como mucho 100 conversaciones por cuenta y proyecto (`MAX_CONVERSATIONS_PER_PROJECT`); al crear otra se borra la que lleva más tiempo sin usarse. 200 mensajes por conversación. Los registros no guardan el contenido.
- La propuesta se valida con zod y con los límites de `checkProposalLimits` antes de devolverla; la web vuelve a validar cada operación con las reglas del editor (`src/domain/aiProposal.ts`).
- Errores (todos llevan `conversationId`): `sin_clave_de_ia` y `tope_sin_fijar` (409), `tope_de_gasto` (429) y `clave_rechazada` (424, el proveedor rechazó la clave) llevan `manageUrl`; `modelo_sin_tarifa`, `demasiadas_peticiones`, `llamada_demasiado_grande` y `cuenta_no_disponible` pasan con su estado y `proveedor_sin_respuesta`, con 424; `credencial_no_valida`, `ruta_no_permitida`, los de configuración de la plataforma y la falta de la credencial de servicio, como 424 `ia_no_disponible`. Propios: `modelo_no_admitido` (400), `propuesta_incompleta` (422, la salida se cortó, a menudo por el tope), `propuesta_rechazada` (422), `propuesta_no_valida`, `proveedor_error` e `ia_sin_respuesta` (424). El detalle de un error del proveedor no se devuelve: queda en el registro.
- **Historial:** cada petición pertenece a una conversación del proyecto (`conversationId`; sin él, se crea con el comienzo de la petición como título). Se guardan la petición, la respuesta (propuesta, modelo, uso, `refs` y lo aplicado) o el error; no el contexto. Al modelo le llegan los últimos 6 turnos completos resumidos (`api/src/ai/history.ts`). Una conversación admite hasta 200 mensajes (409 `conversacion_llena`).
- **Formato de la respuesta del modelo:** plano (`api/src/ai/wire.ts`), sin uniones ni campos con null, porque Anthropic rechaza la gramática del esquema con uniones («The compiled grammar is too large»); la API lo traduce a la propuesta (`schema.ts`). Los fallos del proveedor o de la pasarela se responden con 424 (Cloudflare tapa los 502 y 504 del origen con su página).
- Logs: cuenta, modelo, tokens, código, motivo del proveedor (`detail`) y duración. Nunca la petición, el contexto ni la propuesta.

## Producción

La API corre en este servidor y se publica en `https://nodaria-api.yosiftware.es` por el Cloudflare Tunnel (`C:\cloudflared\config.yml` → `http://127.0.0.1:5003`).

- `ops\install-autostart.ps1` (una vez, **como administrador**): registra las tareas `Nodaria API` y `Nodaria DB Backup` como el usuario `Yosi` (S4U), da permiso de escritura a SQL Server en la carpeta de copias y reinicia `Cloudflared`.
- `ops\run-api.ps1`: vigilante que ejecuta `dist/server.js` con `NODE_ENV=production` y `LOG_DIR=api\logs`, y lo reinicia si se cae.
- Desplegar un cambio: `npm run build` (compila y copia el validador `.mjs` del kit a `dist`) y `ops\restart-api.ps1`.
- **Anunciar una publicación** (`ecosistema-kit/NOVEDADES.md`, «Las novedades de Yosiftware», obligatorio desde el kit 1.45): al sacar a producción algo que la gente nota, `npm run anunciar -- <tipo> <idExterno> "<texto con «Nodaria»>" [enlace]` desde `api\` (usa `.env`, producción; con `npx tsx --env-file=.env.dev src/tools/cli.ts anunciar …`, QA). Tipos: `actualizacion`, `peticion`, `arreglo`, `app_nueva`, `app_disponible`, `aviso`. El `idExterno` es estable (fecha y tarea): repetirlo corrige el anuncio. Una frase corta, sin jerga; como mucho 10 al día. Va con la credencial de servicio (`src/platform/news.ts`); el navegador nunca publica.
- `ops\stop-api.ps1` para el vigilante y la API; `ops\status.ps1` muestra tareas, proceso, salud local y pública y la última copia.
- Logs: `api\logs\api.<fecha>.<n>.log` (JSON de pino, rotación diaria, 30 días), `supervisor.log` y `stderr.log` del último arranque.
- Copias: `ops\backup-db.ps1` → `C:\Users\Yosi\nodaria-backups\db\Nodaria-<fecha>.bak`, 30 días. Restaurar con `RESTORE DATABASE [Nodaria] FROM DISK = N'…' WITH REPLACE` (parando antes la API).

## Tests

```powershell
cd api
npm test                    # unitarios: tokens firmados con una clave ES256 de prueba y el validador del kit
$env:DB_TESTS='1'; npm test # incluye integración: crea y borra Nodaria_test_<hex>
```
