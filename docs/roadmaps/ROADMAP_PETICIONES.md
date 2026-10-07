# Roadmap: textos legales, tablón de peticiones y plugin de Notificapp

> **Activo desde el 2026-10-07.** Pausa `ROADMAP_RENOVACION.md` hasta terminar. Retoma y sustituye las fases 3 y 7 de `ROADMAP_BACKEND.md` (mensajes y Notificapp), que estaban aplazadas.
> Mantener la checklist sincronizada con el estado real durante la ejecución.

## Objetivo

- Publicar una política de privacidad y unas condiciones de uso.
- Que los usuarios propongan ideas o avisen de errores y apoyen con su voto las ideas de otros.
- Que el propietario revise y responda desde el móvil, con un plugin de Notificapp.

## Alcance

Incluido:

- Páginas estáticas `/privacidad` y `/condiciones`, enlazadas desde la app.
- Tablón público de ideas con votos.
- Avisos de errores privados.
- «Mis peticiones» con las respuestas.
- API de peticiones y cola de avisos a Notificapp.
- Rutas `/notificapp/v1/*` y paquete del plugin `nodaria-api`.

Excluido:

- Comentarios entre usuarios.
- Adjuntos o imágenes.
- Panel de administración en la web: el propietario gestiona desde Notificapp.
- Correos de aviso.
- Envío sin cuenta.

## Decisiones

- **Responsable de los textos legales**: Yosiftware, con el contacto `privacidad@yosiftware.es` (decisión del propietario, 2026-10-07). Los textos describen el tratamiento real: datos locales del navegador, cuenta de Firebase, proyectos sincronizados en el servidor propio, peticiones y votos, logs con IP durante 30 días, medición anónima de Yosiftadísticas, y Google y Cloudflare como proveedores. No sustituyen una revisión legal.
- **Páginas estáticas**: `privacidad.html` y `condiciones.html` son entradas propias de Vite, servidas por Hosting con `cleanUrls`. Así tienen URL estable, se leen sin cargar la app y llevan el script de Yosiftadísticas en su `<head>`.
- **Tablón público con votos** (decisión del propietario):
  - Las ideas se publican tras la revisión del propietario. Mientras están `revision` solo las ve su autor; `rechazada` (spam, fuera de lugar) nunca se publica.
  - Los errores son siempre privados (autor y propietario).
  - El tablón no muestra quién propuso cada idea ni quién la votó.
- **Estados**: `revision`, `rechazada`, `abierta`, `planificada`, `en_curso`, `hecha`, `descartada` y `duplicada` (con `duplicate_of`).
  - Públicas: ideas en cualquier estado salvo `revision` y `rechazada`.
  - Se puede votar en `abierta`, `planificada` y `en_curso`.
  - El autor vota su propia idea al crearla.
- **Respuestas**: cada respuesta del propietario guarda el estado y un mensaje público opcional en `request_updates`. Una idea pública muestra su historial a todos. El autor ve un distintivo de respuestas sin leer.
- **Cuenta obligatoria para enviar y votar** (decisión del propietario). El tablón se puede leer sin cuenta. Límite: 5 peticiones por usuario cada 24 h.
- **Borrar la cuenta** borra sus peticiones y votos (`ON DELETE CASCADE`).
- **Modelo**:
  - La migración `0004_requests.sql` sustituye la tabla `messages`, que estaba vacía y nunca tuvo rutas, por `requests`, `request_updates` y `request_votes`.
  - `notificapp_outbox` se conserva.
- **Notificapp**:
  - Plugin `nodaria-api` con tipo de aviso `nodaria_request`. La identidad no estaba registrada; `AGENTS.md` decía `nodaria_message` y se actualiza.
  - El aviso se escribe en `notificapp_outbox` en la misma transacción que la petición, con `externalId` = `request-<id>`. Un drenador en proceso lo publica con reintentos, solo con `NODE_ENV=production`.
  - Acciones `list`, `detail` y `respond` (con `onSuccess: answered`), protegidas con la credencial externa y con `Idempotency-Key`.
  - El primer ZIP se entrega al propietario para revisión; no se instala.

## Fases

### Fase 1 — Textos legales

- [x] `privacidad.html` y `condiciones.html` como entradas de Vite con estilos propios ligeros (temas claro y oscuro) y el script de Yosiftadísticas.
- [x] `cleanUrls` en `firebase.json`.
- [x] Enlaces en la ayuda, en el registro de cuenta y en el formulario de peticiones.

### Fase 2 — API de peticiones

- [x] Migración `0004_requests.sql`.
- [x] Repositorio en SQL y en memoria para pruebas.
- [x] Rutas:
  - `GET /api/requests` (tablón; con sesión opcional marca `voted` y `mine`).
  - `GET /api/requests/{id}`.
  - `POST /api/requests`.
  - `PUT` y `DELETE` `/api/requests/{id}/vote`.
  - `GET /api/me/requests`.
  - `POST /api/me/requests/{id}/read`.
- [x] Pruebas de visibilidad, votos, límites y borrado en cascada.

### Fase 3 — Front de peticiones

- [x] Cliente en `src/services/api.ts`.
- [x] Diálogo «Ideas y peticiones» con tres pestañas:
  - Tablón: orden por votos o recientes, filtro por estado y voto.
  - Mis peticiones: estado, historial y no leídas.
  - Nueva: idea o error, título y descripción.
- [x] Accesos desde la ayuda, el menú de cuenta y la paleta.
- [x] Distintivo de respuestas sin leer.

### Fase 4 — Notificapp

- [x] Cola y drenador con reintentos.
- [x] Rutas `/notificapp/v1/requests`, `/requests/{id}` y `POST /requests/{id}/responses`, con credencial externa e idempotencia.
- [x] `notificapp-plugin/manifest.json` y `ui/index.html`.
- [x] ZIP con `plugin-kit/pack.py` (`api/.runtime/nodaria-api-1.0.0.notificapp.zip`, 2026-10-07).
- [ ] Entregado al propietario e instalado por él, con las credenciales de emisor y externa configuradas.

### Fase 5 — Publicación y cierre

- [x] Copia `Nodaria-20261007-1456.bak` y migración `0004_requests` en la base de producción (2026-10-07).
- [x] API reiniciada y front desplegado (2026-10-07). Comprobado en producción:
  - `/privacidad` y `/condiciones` responden 200 con el script de Yosiftadísticas;
  - el tablón responde vacío y el envío sin sesión, 401;
  - el preflight CORS del voto pasa;
  - el panel responde 503 sin credencial, 401 con una incorrecta y 200 con la externa generada en `api/.runtime/notificapp-upstream.token`.
- [x] Extremo a extremo en local, contra SQL Server y en navegador con una API de prueba:
  - tablón en los dos temas y en móvil;
  - panel con un puente de Notificapp simulado: lista, detalle desde un aviso y respuesta registrada.
- [ ] Extremo a extremo en producción con cuentas reales (propietario): proponer una idea, recibir el aviso, publicarla desde el panel y votarla con otra cuenta.
- [x] `PROJECT_CONTEXT.md`, `docs/backend/README.md` y `AGENTS.md` al día.
- [ ] Volver a `ROADMAP_RENOVACION.md` cuando el plugin esté instalado.

## Estado

| Fase                     | Estado                                       |
| ------------------------ | -------------------------------------------- |
| 1 — Textos legales       | Completada (2026-10-07)                      |
| 2 — API de peticiones    | Completada (2026-10-07)                      |
| 3 — Front de peticiones  | Completada (2026-10-07)                      |
| 4 — Notificapp           | Falta la instalación del propietario         |
| 5 — Publicación y cierre | Publicado (2026-10-07); falta la prueba real |

## Criterios de finalización

- `/privacidad` y `/condiciones` están publicadas y enlazadas.
- Un usuario con sesión puede proponer una idea, verla en «Mis peticiones» y, cuando el propietario la publica, verla en el tablón y recibir votos de otros usuarios.
- Un alta genera un único aviso `nodaria_request` tras confirmar la transacción. Responder desde el panel cambia el estado de forma idempotente y el autor ve la respuesta.
- `npm test`, `npm run lint` y `npm run build` pasan en la raíz, y `npm test` en `api/`.
- El ZIP del plugin está entregado al propietario.
