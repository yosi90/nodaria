# Backend de Nodaria

API Node/TypeScript (Fastify) en `api/`. Valida los tokens de la **cuenta de Yosiftware** (la plataforma común, `ecosistema-kit/`) y guarda los proyectos en SQL Server Express local. Se publica por Cloudflare Tunnel en `nodaria-api.yosiftware.es`; la web se sirve desde Firebase Hosting (`yosiftware-nodaria`). La migración desde Firebase Authentication está en [ROADMAP_MIGRACION_YOSIFTWARE.md](../roadmaps/ROADMAP_MIGRACION_YOSIFTWARE.md).

> **Hasta el corte**, la API de producción sigue ejecutando el build anterior (Firebase Authentication, tablón y plugin de Notificapp) desde `api/dist` contra la base `Nodaria`. Este documento describe la versión migrada de la rama `migracion-yosiftware`. No ejecutes `npm run build` en `api/` hasta el corte.

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

Para nuevas rutas privadas, regístralas dentro del bloque de rutas privadas de `src/app.ts` y obtén el usuario con `authenticatedUser(request)`. Para crear contenido nuevo, llama antes a `assertCanCreate(user)`.

## Feed de cambios

`src/platform/feed.ts` lee `GET /v1/servicio/cambios` con la credencial de servicio y `User-Agent: nodaria-api/1.0`, hasta ponerse al día, cada `PLATFORM_FEED_INTERVAL_MS`. Solo usa `cuenta.estado`: `cerrada` marca `closed_at`, `activa` lo quita, `borrada` borra el usuario y sus proyectos; guarda lo limitado (`restrictions`, `restrictions_until`). Ignora perfiles y relaciones (Nodaria no los enseña). El cursor está en `dbo.platform_feed` (`feed_cursor`) y se guarda en la misma transacción que los cambios.

## Órdenes de la migración

```powershell
npm run enlazar-cuenta -- <id local> <identificador de la cuenta de Yosiftware>
npm run exportar-tablon -- <archivo.json>      # fuera de Git: lleva textos de personas
```

Con `--env-file=.env.dev` se ejecutan contra la base de desarrollo (`npx tsx --env-file=.env.dev src/tools/cli.ts …`). Cada orden escribe una línea JSON con la base, el resultado y la fecha.

- `enlazar-cuenta`: idempotente (`linked`, `unchanged`). Si la persona entró antes de enlazar y la API le creó un usuario vacío, mueve el identificador al antiguo y borra el vacío (`moved`); si ese usuario tiene proyectos, no toca nada (`taken_by_other`). No reasigna un usuario ya enlazado con otra cuenta (`already_linked`).
- `exportar-tablon`: formato `nodaria-tablon-1` de la petición de migración, con los autores y votantes por su identificador global; sale con código 1 y los lista si alguno no está enlazado.

## Migraciones

- Archivos `api/migrations/NNNN_descripcion.sql`, aplicados en orden; cada archivo en una transacción y lotes separados por una línea `GO`.
- `dbo.schema_migrations` guarda id y SHA-256 de cada migración aplicada. Si se edita una ya aplicada, `migrate` falla: hay que crear una nueva.
- `0006_platform_identity`: `id_global` (único filtrado), `firebase_uid` opcional (único filtrado), `closed_at`, lo limitado y `platform_feed`.

## Modelo de datos

| Tabla            | Clave                               | Contenido                                                                                       |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `users`          | `id` (`id_global` único si no nulo) | Ancla de los proyectos de cada cuenta. `firebase_uid` solo en las cuentas de antes de migrar.  |
| `projects`       | `(user_id, project_id)`             | Un documento JSON por proyecto, con `version`, `updated_at` y borrado lógico.                   |
| `platform_feed`  | `id` = 1                            | Cursor del feed de cambios.                                                                     |

`projects` cuelga de `users` con `ON DELETE CASCADE`. Las tablas del antiguo tablón (`requests`, `request_updates`, `request_votes`) y `notificapp_outbox` se conservan, sin uso, hasta exportar e importar el tablón en el corte; las retira una migración posterior. Las columnas `email`, `display_name` y `photo_url` ya no se escriben.

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

El documento es el `Project` del front tal cual (JSON); la API solo comprueba id, nombre, `updatedAt` y las tres listas. El control de versión es optimista.

Errores con formato `{ "error": "<codigo>", "message": "<texto en español>" }`. Límite general de 300 peticiones/minuto por IP (`CF-Connecting-IP` detrás del túnel) y 120 por usuario autenticado.

## Producción

La API corre en este servidor y se publica en `https://nodaria-api.yosiftware.es` por el Cloudflare Tunnel (`C:\cloudflared\config.yml` → `http://127.0.0.1:5003`).

- `ops\install-autostart.ps1` (una vez, **como administrador**): registra las tareas `Nodaria API` y `Nodaria DB Backup` como el usuario `Yosi` (S4U), da permiso de escritura a SQL Server en la carpeta de copias y reinicia `Cloudflared`.
- `ops\run-api.ps1`: vigilante que ejecuta `dist/server.js` con `NODE_ENV=production` y `LOG_DIR=api\logs`, y lo reinicia si se cae.
- Desplegar un cambio: `npm run build` (compila y copia el validador `.mjs` del kit a `dist`) y `ops\restart-api.ps1`.
- `ops\stop-api.ps1` para el vigilante y la API; `ops\status.ps1` muestra tareas, proceso, salud local y pública y la última copia.
- Logs: `api\logs\api.<fecha>.<n>.log` (JSON de pino, rotación diaria, 30 días), `supervisor.log` y `stderr.log` del último arranque.
- Copias: `ops\backup-db.ps1` → `C:\Users\Yosi\nodaria-backups\db\Nodaria-<fecha>.bak`, 30 días. Restaurar con `RESTORE DATABASE [Nodaria] FROM DISK = N'…' WITH REPLACE` (parando antes la API).

## Tests

```powershell
cd api
npm test                    # unitarios: tokens firmados con una clave ES256 de prueba y el validador del kit
$env:DB_TESTS='1'; npm test # incluye integración: crea y borra Nodaria_test_<hex>
```
