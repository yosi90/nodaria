# Roadmap: backend, cuentas y sincronización

> Roadmap activo principal desde el 2026-10-04. Mientras dure, `ROADMAP_RENOVACION.md` queda en pausa como referencia de las fases de producto pendientes; se retoma al cerrar este.
> Mantener la checklist sincronizada con el estado real durante la ejecución.

## Objetivo

Que Nodaria deje de depender del `localStorage` de un solo navegador: cuentas de usuario, proyectos guardados en el servidor y sincronizados entre dispositivos, y un canal de mensajes de los usuarios al propietario. Todo opcional: la aplicación debe seguir funcionando en local sin cuenta.

## Alcance

Incluido: API propia en `api/`, identidad con Firebase Authentication, persistencia en SQL Server Express del servidor, publicación por el túnel de Cloudflare, integración con Notificapp (plugin de proyecto y avisos de agente), cuenta y sincronización en el front, mensajes de usuarios con respuesta del propietario.

Excluido (por ahora): colaboración en tiempo real sobre un mismo proyecto, compartir proyectos entre cuentas, aplicación móvil, almacenamiento de imágenes fuera del documento del proyecto.

## Decisiones

- **Misma arquitectura que Lorcana** (`mazos lorcana/back`): Node 24 + TypeScript + Fastify, `firebase-admin` para validar el ID token de Firebase en cada petición privada (sin sesiones propias), SQL Server Express local con autenticación de Windows (la identidad del proceso; sin usuario ni contraseña SQL), migraciones SQL versionadas con suma de control, logs con `pino-roll`, tarea programada con vigilante y copias diarias.
- **Firebase**: proyecto `yosiftware-nodaria` (Hosting ya en uso). Proveedores Email/Password y Google. Las cuentas de correo deben verificar la dirección antes de usar la API (Google llega verificado). Los correos de Firebase (verificación, recuperación) salen por el SMTP de Hostinger con el buzón general `correo@yosiftware.es` (remitente `noreply@yosiftware.es`, alias del mismo buzón), igual que en Lorcana.
- **Red**: la API escucha solo en `127.0.0.1:5003` (5000 Fichas, 5001 Libros, 5002 Lorcana, 5101 Libros QA, 5211 Notificapp) y se publica como `https://nodaria-api.yosiftware.es` por el túnel existente (`C:\cloudflared\config.yml`). SQL Server no se expone.
- **Modelo de datos**: un proyecto es un documento JSON completo (`Project` del front, imágenes incluidas) por usuario, con `version` que crece en cada escritura. El cliente envía `baseVersion`; si no coincide, la API responde 409 y el cliente resuelve con «último cambio gana» por `updatedAt`. Borrado lógico (`deleted_at`) para que los demás dispositivos lo reciban. Límite de 20 MiB por proyecto.
- **Mensajes**: los usuarios envían sugerencias, errores o consultas desde la app; la API los guarda y avisa a Notificapp tras confirmar la transacción (cola `notificapp_outbox` con reintentos). El propietario responde desde el panel del plugin; la respuesta se muestra en la app.
- **Notificapp**: plugin de proyecto `nodaria-api` (tipo de aviso `nodaria_message`, panel propio, acciones `list`, `detail`, `respond` con `onSuccess: answered`) y, por otra vía, avisos de agente desde el espacio «Agentes» del servidor. El kit copiado vive en `plugin-kit/` (ignorado por Git); el código propio del plugin, en `notificapp-plugin/`.
- **Front**: el login es opcional. `localStorage` sigue siendo la copia local de trabajo; la cuenta añade la copia en el servidor y la sincronización. Los proyectos vacíos sin tocar no se suben.

## Fases

### Fase 0 — Preparación externa (propietario)

- [x] Proyecto Firebase `yosiftware-nodaria` (existía para Hosting).
- [x] App web «Nodaria Web» registrada (2026-10-04, `1:485119322480:web:d70fd1bf48e1fc648587b5`; configuración pública en `docs/backend/README.md`).
- [ ] Activar los proveedores Email/Password y Google en Firebase Authentication.
- [ ] Añadir `nodaria.yosiftware.es` a los dominios autorizados de Authentication (`localhost` y `yosiftware-nodaria.firebaseapp.com` ya lo están).
- [ ] Configurar el SMTP de Hostinger (`correo@yosiftware.es`, remitente `noreply@yosiftware.es`) y las plantillas en español; URL de acción `https://nodaria.yosiftware.es/__/auth/action`.
- [ ] Generar la cuenta de servicio de Firebase Admin, guardarla en `api/secrets/` (ignorado) y apuntar `GOOGLE_APPLICATION_CREDENTIALS` en `api/.env`.
- [ ] Confirmar que Claude en Nodaria usa el emisor de agentes del servidor (`notificapp/.runtime/agent-server.json`, el mismo que Codex en este equipo) o crear uno con `agent_cli add`.

### Fase 1 — Base del backend

- [x] Proyecto `api/` con Fastify, TypeScript, zod y Vitest; dependencias fijadas a las versiones de Lorcana.
- [x] Configuración por entorno (`api/.env`, ignorado) con validación y mensajes en español.
- [x] `GET /api/health` con comprobación de base de datos (503 si falla).
- [x] Cliente SQL Server (`mssql` + `msnodesqlv8`, autenticación de Windows) con pool y transacciones.
- [x] Migraciones SQL versionadas con suma de control; `npm run migrate` crea la base si no existe.
- [x] Base `Nodaria` creada en `localhost\SQLEXPRESS` con `0001_users`, `0002_projects` y `0003_messages` (tablas `users`, `projects`, `messages`, `notificapp_outbox`).
- [x] Autenticación: `Authorization: Bearer <Firebase ID token>` verificado con `firebase-admin` (firma, proyecto, caducidad, revocación); cuentas de correo sin verificar rechazadas con `email_not_verified`; alta automática del usuario en SQL.
- [x] `GET /api/me` y `DELETE /api/me` (borrado de cuenta y datos en cascada, Firebase dentro de la transacción, login reciente obligatorio).
- [x] Límites de peticiones por IP (`CF-Connecting-IP`) y por usuario.
- [x] Pruebas: 22 en verde, incluida la integración con SQL Server (`DB_TESTS=1`).
- [ ] Prueba con el emulador de Firebase Auth (`npm run test:emulator`, proyecto `demo-nodaria`).
- [ ] Arranque real con la cuenta de servicio y una llamada autenticada de extremo a extremo (depende de la Fase 0).

### Fase 2 — Proyectos en el servidor (API)

- [ ] `GET /api/projects`: resumen de los proyectos del usuario (id, nombre, versión, `updatedAt`, `deletedAt`, tamaño), borrados incluidos.
- [ ] `GET /api/projects/{id}`: documento completo con su versión.
- [ ] `PUT /api/projects/{id}` con `{ document, baseVersion }`: crea o actualiza; 409 `version_conflict` con la versión vigente si `baseVersion` no coincide; 413 si supera `PROJECT_MAX_BYTES`; validación mínima del documento (id, nombre, listas).
- [ ] `DELETE /api/projects/{id}`: borrado lógico con control de versión.
- [ ] Pruebas con almacén en memoria y con SQL Server.

### Fase 3 — Mensajes y Notificapp (API)

- [ ] `POST /api/messages` (tipo, asunto, cuerpo, contexto), `GET /api/messages`, `PUT /api/messages/{id}/read`.
- [ ] Cola `notificapp_outbox` escrita en la misma transacción y drenador en proceso con reintentos; credencial de emisor en `api/.runtime/notificapp-sender.token`.
- [ ] Rutas del panel `/notificapp/v1/requests`, `/requests/{id}` y `POST /requests/{id}/responses` con credencial externa (`api/.runtime/notificapp-upstream.token`) e `Idempotency-Key` (misma clave y huella → mismo resultado; distinta sobre un mensaje resuelto → 409).
- [ ] `notificapp-plugin/manifest.json` (`nodaria-api`, `nodaria_message`, `respond` con `onSuccess: answered`) y `ui/index.html` autocontenido con `getLaunchEvent()` y `getTheme()`.
- [ ] Empaquetar con `python plugin-kit/pack.py --template notificapp-plugin` y entregar el ZIP al propietario para `plugin_cli install`; después `set-upstream-token nodaria-api <archivo>`.
- [ ] Pruebas de idempotencia, autorización externa y envío con `fetch` simulado.

### Fase 4 — Publicación

- [ ] `api/ops/`: `run-api.ps1` (vigilante), `restart-api.ps1`, `stop-api.ps1`, `status.ps1`, `backup-db.ps1`, `install-autostart.ps1` (tareas «Nodaria API» y «Nodaria DB Backup», copias en `C:\Users\Yosi\nodaria-backups\db`).
- [ ] Ingress `nodaria-api.yosiftware.es → http://127.0.0.1:5003` en `C:\cloudflared\config.yml` (copia previa) y CNAME con `cloudflared tunnel route dns`.
- [ ] Ejecutar `install-autostart.ps1` como administrador (registra tareas y reinicia `Cloudflared`).
- [ ] Despliegue del front desde el servidor con `npm run deploy` (usa el `firebase-tools` de `api/`).
- [ ] Comprobar `/api/health` en local y por el dominio público.

### Fase 5 — Cuenta en el front

- [ ] SDK de Firebase (`src/services/firebase.ts`) con idioma `es`; `authDomain` propio en producción.
- [ ] Cliente de la API (`src/services/api.ts`) con errores tipados y detección de «sin conexión».
- [ ] Estado de autenticación (`src/state/auth.tsx`): cargando, sin sesión, pendiente de verificar, con sesión.
- [ ] Diálogo de acceso: correo y contraseña, registro con verificación, Google, recuperación de contraseña, reenvío de verificación.
- [ ] Menú de cuenta en la barra superior: correo, estado de sincronización, sincronizar ahora, cerrar sesión (con opción de vaciar el navegador), eliminar cuenta (reautenticación).
- [ ] Textos vacíos y ayuda: qué aporta la cuenta y que es opcional.

### Fase 6 — Sincronización en el front

- [ ] Reglas puras y probadas (`src/services/sync.ts`): qué subir, bajar, borrar en local o en remoto a partir de local, remoto y metadatos (`nodaria_sync_v1`: uid, versión y `updatedAt` sincronizados por proyecto).
- [ ] Último cambio gana por `updatedAt` cuando ambos lados cambiaron; aviso al usuario. Los proyectos vacíos sin tocar no se suben.
- [ ] Motor: sincronización completa al iniciar sesión, subida con retardo tras cambios locales, borrado remoto al borrar en local, cada 5 minutos, al recuperar conexión y al volver a la pestaña.
- [ ] Acción `sync-apply` fuera del historial de deshacer; `reset-state` al vaciar el navegador.
- [ ] Indicador de estado (sincronizado, guardando, sin conexión, error) en el botón de cuenta.
- [ ] Pruebas de extremo a extremo con dos navegadores.

### Fase 7 — Mensajes en el front

- [ ] «Enviar un mensaje» (desde el menú de cuenta y la ayuda): tipo, asunto y cuerpo; requiere sesión.
- [ ] «Mis mensajes»: lista con estado y respuesta; marcar respuestas como leídas; distintivo de respuestas sin leer.

### Fase 8 — Cierre

- [ ] Migrar el proyecto real del libro a la cuenta principal y comprobar en dos dispositivos.
- [ ] Documentación (`docs/backend/README.md`, `PROJECT_CONTEXT.md`, README) al día; retomar `ROADMAP_RENOVACION.md`.

## Estado

| Fase                           | Estado                                  |
| ------------------------------ | --------------------------------------- |
| 0 — Preparación externa        | En curso (faltan pasos del propietario) |
| 1 — Base del backend           | Hecha salvo emulador y arranque real    |
| 2 — Proyectos en el servidor   | Pendiente                               |
| 3 — Mensajes y Notificapp      | Pendiente                               |
| 4 — Publicación                | Pendiente                               |
| 5 — Cuenta en el front         | Pendiente                               |
| 6 — Sincronización en el front | Pendiente                               |
| 7 — Mensajes en el front       | Pendiente                               |
| 8 — Cierre                     | Pendiente                               |

## Criterios de finalización

- Un usuario puede crear cuenta, iniciar sesión en dos navegadores y ver el mismo proyecto en ambos tras editarlo en uno.
- Sin cuenta, la aplicación funciona exactamente igual que hoy.
- Un mensaje enviado desde la app llega a Notificapp y su respuesta aparece en la app.
- `npm test`, `npm run lint` y `npm run build` pasan en la raíz y `npm test` en `api/`; la API se reinicia sola y tiene copia diaria.
- `PROJECT_CONTEXT.md` y `docs/backend/README.md` reflejan la arquitectura resultante.
