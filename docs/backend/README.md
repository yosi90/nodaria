# Backend de Nodaria

API Node/TypeScript (Fastify) en `api/`. Valida usuarios de Firebase Authentication y guarda los datos en SQL Server Express local. Se publicará por Cloudflare Tunnel en `nodaria-api.yosiftware.es`; la web se sirve desde Firebase Hosting (`yosiftware-nodaria`). El plan completo está en [ROADMAP_BACKEND.md](../roadmaps/ROADMAP_BACKEND.md).

## Requisitos

- Node 24+.
- SQL Server Express (`localhost\SQLEXPRESS`) con autenticación de Windows.
- ODBC Driver 18 for SQL Server (lo usa el driver nativo `msnodesqlv8`).
- Cuenta de servicio de Firebase Admin del proyecto `yosiftware-nodaria` (fuera del repositorio).

La API se conecta con la identidad del proceso que la ejecuta (`Trusted_Connection`), igual que Lorcana, Libros y Fichas. No hay usuario ni contraseña SQL en la configuración.

## Puesta en marcha

```powershell
cd api
npm ci
copy .env.example .env      # ajustar GOOGLE_APPLICATION_CREDENTIALS
npm run migrate             # crea la base Nodaria si no existe y aplica migrations/*.sql
npm run dev                 # http://127.0.0.1:5003/api/health
```

npm 11 bloquea los scripts de instalación salvo los aprobados en `allowScripts` de `api/package.json`. Si al actualizar una dependencia cambia su versión, apruébala con `npm approve-scripts <paquete>` y ejecuta `npm rebuild <paquete>`.

## Configuración (`api/.env`)

| Variable                         | Por defecto                            | Uso                                                                          |
| -------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `HOST` / `PORT`                  | `127.0.0.1` / `5003`                   | Solo escucha en local; el túnel publica el puerto.                           |
| `DB_SERVER`                      | `localhost\SQLEXPRESS`                 | Instancia de SQL Server.                                                     |
| `DB_NAME`                        | `Nodaria`                              | Base de datos (solo letras, números y `_`).                                  |
| `DB_DRIVER`                      | `ODBC Driver 18 for SQL Server`        | Driver ODBC.                                                                 |
| `CORS_ORIGINS`                   | –                                      | Orígenes web permitidos, separados por comas.                                |
| `FIREBASE_PROJECT_ID`            | `yosiftware-nodaria`                   | Proyecto de Firebase Auth.                                                   |
| `GOOGLE_APPLICATION_CREDENTIALS` | –                                      | Cuenta de servicio de Firebase Admin (no versionar).                         |
| `PROJECT_MAX_BYTES`              | `20971520`                             | Tamaño máximo del JSON de un proyecto.                                       |
| `NOTIFICAPP_URL`                 | `https://notificapp-api.yosiftware.es` | API de Notificapp (en este servidor también `http://127.0.0.1:5211`).        |
| `NOTIFICAPP_SENDER_TOKEN_FILE`   | `.runtime/notificapp-sender.token`     | Credencial de emisor del plugin `nodaria-api` (solo el token).               |
| `NOTIFICAPP_UPSTREAM_TOKEN_FILE` | `.runtime/notificapp-upstream.token`   | Credencial externa con la que Notificapp llama al panel.                     |
| `OWNER_FIREBASE_UIDS`            | –                                      | UID de Firebase del propietario (comas); `/api/me` marca `excludeFromStats`. |
| `UV_THREADPOOL_SIZE`             | `4` (Node)                             | Hilos de libuv; `msnodesqlv8` ocupa uno por consulta. Usar `16`.             |
| `LOG_DIR`                        | –                                      | Logs diarios rotados (vacío: salida estándar).                               |

## Firebase

La clave web (`apiKey`) no está en el repositorio: el front la lee de `VITE_FIREBASE_API_KEY` en `.env.local` (ignorado por Git; plantilla en `.env.example`). Es una clave pública por diseño (viaja en el bundle), pero fuera del repositorio no dispara los avisos de secretos de GitHub. El resto de la configuración (projectId, appId, authDomain…) va en `src/services/firebase.ts`.

El front usa `authDomain: yosiftware-nodaria.firebaseapp.com`, como Lorcana. Pasar al dominio propio (`nodaria.yosiftware.es`, donde Hosting también sirve `/__/auth/handler`) exigiría autorizar `https://nodaria.yosiftware.es/__/auth/handler` como URI de redirección en el cliente OAuth de Google Cloud; el 2026-10-04 Google no mostraba el selector sin ese paso.

## Migraciones

- Archivos `api/migrations/NNNN_descripcion.sql`, aplicados en orden; cada archivo en una transacción y lotes separados por una línea `GO`.
- `dbo.schema_migrations` guarda id y SHA-256 de cada migración aplicada. Si se edita una ya aplicada, `migrate` falla: hay que crear una nueva.

## Modelo de datos

| Tabla               | Clave                       | Contenido                                                                                                     |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`             | `id` (`firebase_uid` único) | Ancla de los datos de cada cuenta de Firebase.                                                                |
| `projects`          | `user_id`, `project_id`     | Documento JSON del proyecto, `version`, `updated_at` (cliente), `server_updated_at`, `deleted_at`, tamaño.    |
| `requests`          | `id`                        | Peticiones: `kind` (`idea`/`error`), título, cuerpo, `status`, `duplicate_of`, `author_read_at`.              |
| `request_updates`   | `id`                        | Respuestas del propietario (estado y mensaje público) con la clave de idempotencia y la huella de Notificapp. |
| `request_votes`     | `request_id`, `user_id`     | Un voto por usuario e idea.                                                                                   |
| `notificapp_outbox` | `external_id`               | Avisos pendientes de enviar a Notificapp, con reintentos.                                                     |

`projects` y `requests` cuelgan de `users` con `ON DELETE CASCADE`, y `request_updates` y `request_votes` de `requests`. Los votos propios y las marcas de duplicado que apuntan a peticiones de la cuenta se limpian antes en `UserStore.delete` (SQL Server no admite dos rutas de cascada). `DELETE /api/me` borra todo. La migración `0004_requests` sustituyó a `messages`, que nunca llegó a usarse.

## Endpoints

| Método | Ruta          | Auth | Descripción                                                                                                                    |
| ------ | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health` | No   | Estado de la API y de la base de datos (503 si la base falla).                                                                 |
| GET    | `/api/me`     | Sí   | Perfil del usuario; lo crea en SQL en su primera petición. `excludeFromStats`: la cuenta es del propietario (Yosiftadísticas). |
| DELETE | `/api/me`     | Sí   | Borra el usuario en SQL (y sus datos) y su cuenta de Firebase. Exige un inicio de sesión de menos de 5 minutos.                |

| GET | `/api/projects` | Sí | Resumen de los proyectos de la cuenta (id, nombre, `version`, `updatedAt`, `deletedAt`, tamaño), borrados incluidos. |
| GET | `/api/projects/{id}` | Sí | Documento completo con su versión. 404 `project_not_found` o `project_deleted`. |
| PUT | `/api/projects/{id}` | Sí | `{ document, baseVersion }`: crea (`baseVersion` 0) o actualiza. 409 `version_conflict` con `current`; 413 `project_too_large`; 400 `project_id_mismatch`. |
| DELETE | `/api/projects/{id}` | Sí | Borrado lógico; `?baseVersion=n` opcional para exigir la versión. Idempotente sobre un borrado. |

El documento es el `Project` del front tal cual (JSON); la API solo comprueba id, nombre, `updatedAt` y las tres listas. El control de versión es optimista: el cliente guarda la versión que sincronizó y la envía como `baseVersion`.

### Peticiones

| Método | Ruta                         | Auth     | Descripción                                                                                                                          |
| ------ | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/requests`              | Opcional | Tablón: ideas públicas. `sort=votes\|recent`, `status`, `limit` (≤100), `offset`. Con sesión, cada idea lleva `voted` y `mine`.      |
| GET    | `/api/requests/{id}`         | Opcional | Detalle con historial si es pública o del visitante; si no, 404 `request_not_found`.                                                 |
| POST   | `/api/requests`              | Sí       | `{ kind, title (4–120), body (10–4000) }` → 201. Nace en `revision`; una idea lleva el voto del autor. 429 `request_limit` (5/24 h). |
| PUT    | `/api/requests/{id}/vote`    | Sí       | Vota una idea pública. 409 `voting_closed` si ya no admite votos (`hecha`, `descartada`, `duplicada`).                               |
| DELETE | `/api/requests/{id}/vote`    | Sí       | Quita el voto.                                                                                                                       |
| GET    | `/api/me/requests`           | Sí       | Peticiones propias con historial y `unread` (respuestas posteriores a la última lectura).                                            |
| POST   | `/api/me/requests/{id}/read` | Sí       | Marca como leídas las respuestas de una petición propia. 204.                                                                        |

Estados: `revision` y `rechazada` nunca son públicos; una idea en `abierta`, `planificada`, `en_curso`, `hecha`, `descartada` o `duplicada` sale en el tablón (sin autor). Los errores son siempre privados. Reglas en `src/requests/model.ts`.

### Administración

Las cuentas con `users.is_admin = 1` (migración `0005_admins`) ven «Administración» en el menú de cuenta y usan estas rutas. Las demás reciben 403 `admin_required`. `GET /api/me` devuelve `isAdmin`. El permiso se concede a mano, con la API en marcha o sin ella:

```sql
UPDATE dbo.users SET is_admin = 1 WHERE firebase_uid = N'<uid>';  -- 0 para retirarlo
```

| Método | Ruta                                 | Descripción                                                                                                                |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/requests`                | `scope=open\|all` (por defecto `open`: las que hay que atender), `status`, `kind`, `limit`, `offset` → `{ items, total }`. |
| GET    | `/api/admin/requests/{id}`           | Igual que el detalle del panel de Notificapp.                                                                              |
| POST   | `/api/admin/requests/{id}/responses` | Igual que la respuesta de Notificapp (`Idempotency-Key` obligatoria; el front la genera y la reutiliza al reintentar).     |

La validación y la idempotencia de las respuestas viven en `src/requests/answer.ts` y las comparten las dos vías.

### Notificapp (plugin `nodaria-api`)

- **Avisos**: cada petición nueva escribe en `notificapp_outbox`, en la misma transacción, el aviso `nodaria_request` con `externalId = request-<id>` y el texto completo (solo con `NODE_ENV=production`). El drenador en proceso (`src/notificapp/outbox.ts`) lo publica en `NOTIFICAPP_URL/v1/events` con la credencial de emisor de `NOTIFICAPP_SENDER_TOKEN_FILE`. Si falla, reintenta a 1, 2, 4… minutos (hasta 6 h). Si falta la credencial, los avisos esperan en la cola.
- **Panel**: `GET /notificapp/v1/requests` (abiertas: `revision`, `abierta`, `planificada`, `en_curso`; hasta 100 y `hasMore`), `GET /notificapp/v1/requests/{id}` (con autor, votos, `externalId` y las 20 últimas respuestas) y `POST /notificapp/v1/requests/{id}/responses` (`{ status, message?, duplicateOf? }`). Solo aceptan `Authorization: Bearer <credencial externa>` (archivo `NOTIFICAPP_UPSTREAM_TOKEN_FILE`; sin él, 503 `notificapp_unavailable`; distinta, 401). El `POST` exige `Idempotency-Key`: la misma clave con la misma respuesta devuelve el resultado con `replayed: true`; con otra respuesta u otra petición, 409 `idempotency_conflict`.
- **Paquete**: `notificapp-plugin/manifest.json` y `ui/index.html`. Se empaqueta con `python plugin-kit/pack.py --template notificapp-plugin --output api/.runtime/nodaria-api-<versión>.notificapp.zip`.
- **Credenciales** (en `api/.runtime/`, ignorada por Git):
  - `notificapp-sender.token`: la de emisor, que da `plugin_cli install`.
  - `notificapp-upstream.token`: valor aleatorio largo que se registra con `plugin_cli set-upstream-token nodaria-api <archivo>`. Para revocarla, cambia o borra el archivo.
  - `notificapp-update.token`: la de actualización, que se copia de `notificapp/.runtime/plugin-credentials/nodaria-api-update.token` cuando el propietario activa o regenera las actualizaciones en la APK.
- **Publicar una versión** del panel: sube `version` en el manifiesto, empaqueta y ejecuta `python plugin-kit/publish.py --url https://notificapp-api.yosiftware.es --id nodaria-api --token-file api/.runtime/notificapp-update.token <zip>`. Respuestas: 200, publicada; 401, credencial antigua; 403, permiso apagado o permisos cambiados; 409, versión no creciente. Cambiar `eventKinds`, `agents` o `api` exige un `upgrade` local del propietario.

## Producción

La API corre en este servidor y se publica en `https://nodaria-api.yosiftware.es` por el Cloudflare Tunnel (`C:\cloudflared\config.yml` → `http://127.0.0.1:5003`; copia previa en `config.yml.bak-20261004-nodaria`).

- `ops\install-autostart.ps1` (una vez, **como administrador**): registra las tareas `Nodaria API` y `Nodaria DB Backup` como el usuario `Yosi` (S4U), da permiso de escritura a SQL Server en la carpeta de copias y reinicia `Cloudflared`.
- `ops\run-api.ps1`: vigilante que ejecuta `dist/server.js` con `NODE_ENV=production` y `LOG_DIR=api\logs`, y lo reinicia si se cae (espera creciente hasta 5 min).
- Desplegar un cambio: `npm run build` y `ops\restart-api.ps1` (crea `logs\restart.request`; la API lo detecta, se cierra y el vigilante arranca el build nuevo).
- `ops\stop-api.ps1` para el vigilante y la API; `ops\status.ps1` muestra tareas, proceso, salud local y pública y la última copia.
- Logs: `api\logs\api.<fecha>.<n>.log` (JSON de pino, rotación diaria, 30 días), `supervisor.log` y `stderr.log` del último arranque.
- Copias: `ops\backup-db.ps1` → `C:\Users\Yosi\nodaria-backups\db\Nodaria-<fecha>.bak`, 30 días. Restaurar con `RESTORE DATABASE [Nodaria] FROM DISK = N'…' WITH REPLACE` (parando antes la API).

Errores con formato `{ "error": "<codigo>", "message": "<texto en español>" }`. Límite general de 300 peticiones/minuto por IP (`CF-Connecting-IP` detrás del túnel) y 120 por usuario autenticado.

## Autenticación

Las rutas privadas reciben `Authorization: Bearer <Firebase ID token>`. La API lo verifica con `firebase-admin` (firma, proyecto, caducidad, revocación y cuenta desactivada), da de alta o actualiza el usuario en `dbo.users` y lo deja en `request.user`.

| Código                  | HTTP | Cuándo                                                             |
| ----------------------- | ---- | ------------------------------------------------------------------ |
| `missing_token`         | 401  | No hay cabecera `Authorization: Bearer`.                           |
| `invalid_token`         | 401  | Token mal formado, de otro proyecto o de una cuenta borrada.       |
| `token_expired`         | 401  | Token caducado: el cliente debe pedir uno nuevo a Firebase.        |
| `token_revoked`         | 401  | Sesiones revocadas: hay que volver a iniciar sesión.               |
| `email_not_verified`    | 403  | Cuenta de email/contraseña sin verificar (Google no lo necesita).  |
| `account_disabled`      | 403  | Cuenta desactivada en Firebase o con `disabled_at` en SQL.         |
| `recent_login_required` | 403  | `DELETE /api/me` con un inicio de sesión de hace más de 5 minutos. |

Para nuevas rutas privadas, regístralas dentro del bloque de rutas privadas de `src/app.ts` y obtén el usuario con `authenticatedUser(request)`.

## Tests

```powershell
cd api
npm test                    # unitarios (sin base de datos)
$env:DB_TESTS='1'; npm test # incluye integración: crea y borra Nodaria_test_<hex>
npm run test:emulator       # emulador de Firebase Auth (Java 21), proyecto demo-nodaria
```
