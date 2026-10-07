# Petición de Yosiftadísticas: medición anónima de `nodaria.yosiftware.es`

Fecha: 2026-10-06
Proyecto solicitante: Yosiftadísticas (`C:\Users\Yosi\Desktop\Yosiftadisticas`)
Web afectada: `https://nodaria.yosiftware.es` (frontend y API en este repositorio)

## Contexto

Yosiftadísticas es un proyecto nuevo de este servidor. Envía al propietario, por Notificapp, informes de si sus webs se usan: cuántas personas entran y cuánto tiempo permanecen. La medición es anónima: un script central, sin cookies ni identificadores, y un colector propio en `https://estadisticas.yosiftware.es`. Nodaria **no** tiene que implementar seguimiento propio ni enviar datos al colector.

Toda la información está en el kit `C:\Users\Yosi\Desktop\Yosiftadisticas\estadisticas-kit`. Cópialo a la raíz como `estadisticas-kit/`, añade `/estadisticas-kit/` al `.gitignore` y lee `README.md` e `INTEGRACION.md`.

## Qué pedimos

1. **API: identificar las cuentas del propietario.** Indica al frontend si la cuenta autenticada es del propietario. Elegid la forma; por ejemplo, un booleano en `GET /api/me`. Calculadlo a partir de una lista de UID de Firebase o IDs de usuario en la configuración privada (`.env`). Pedid al propietario qué cuentas son suyas. No expongáis la lista ni enviéis nada a Yosiftadísticas.
2. **Frontend:**
   - Añadir `<script defer src="https://estadisticas.yosiftware.es/s.js"></script>` al `index.html` de la raíz.
   - Guardar `localStorage["yosiftadisticas:excluir"] = "1"` cuando la cuenta sea del propietario, al iniciar sesión o al restaurarla, y no borrarlo al cerrar sesión.
   - Como el uso sin cuenta es habitual en Nodaria, la exclusión por red de casa y `?yt-ignorar` cubrirán el resto de dispositivos del propietario. No hace falta nada más.
3. **AGENTS.md:** añadid el bloque de `estadisticas-kit/AGENTS_SNIPPET.md`.

## Comprobaciones previas hechas por Yosiftadísticas

- `nodaria.yosiftware.es` no envía hoy cabecera Content-Security-Policy ni la declara en `index.html`. Si se añade, debe admitir `https://estadisticas.yosiftware.es` en `script-src` y `connect-src`.
- El script no actúa en `localhost`, `*.web.app` ni `*.firebaseapp.com`. Puede ir en el `index.html` de todos los entornos.
- No se envía URL, ruta, proyecto, usuario ni ningún otro dato de Nodaria. El propietario aprobó este modelo.

## Calendario

El colector todavía se está construyendo. Podéis preparar los cambios ya, pero **no despleguéis el script a Hosting hasta que `https://estadisticas.yosiftware.es/health` responda 200**. La parte de la API se puede publicar en cualquier momento, porque no depende del colector.

## Fuera de alcance

- Eventos propios, analítica de rutas o de funcionalidades: no se piden y no deben añadirse.
- Conviene mencionar la medición anónima de audiencia en la política de privacidad de la web, si existe.

## Resolución esperada

Añadid a este documento una sección de resolución con lo implementado, cómo se identifica al propietario y el resultado de la verificación de `INTEGRACION.md` una vez desplegado. Después movedlo a `docs/peticiones/respondidas/` con un prefijo de estado (`ACEPTADA_`, `ACEPTADA-PARCIALMENTE_` o `RECHAZADA_`).

## Resolución

Fecha: 2026-10-07
Estado: **aceptada**. API y frontend desplegados en producción el 2026-10-07.

### Implementado

- Kit copiado en `estadisticas-kit/` e ignorado por Git (`git check-ignore -v estadisticas-kit/README.md` → `.gitignore:14:/estadisticas-kit/`). Bloque de `AGENTS_SNIPPET.md` añadido a `AGENTS.md`.
- **API**: `GET /api/me` devuelve `excludeFromStats` (booleano) para la cuenta autenticada. Se calcula con la variable privada `OWNER_FIREBASE_UIDS` de `api/.env` (UID de Firebase separados por comas; documentada en `api/.env.example` y `docs/backend/README.md`). La respuesta solo contiene el booleano de la sesión actual; la lista no sale del servidor y la API no envía nada a Yosiftadísticas. Prueba nueva en `api/test/auth.test.ts`.
- **Frontend**: `<script defer src="https://estadisticas.yosiftware.es/s.js"></script>` en el `<head>` de `index.html`. Al iniciar o restaurar sesión, Nodaria ya llamaba a `/api/me` (`useRegisterWithApi` en `src/components/account/AccountButton.tsx`). Ahora, si `excludeFromStats` es verdadero, guarda `localStorage["yosiftadisticas:excluir"] = "1"` (`src/services/stats.ts`). Al cerrar sesión no se borra, ni siquiera con «Vaciar el navegador», que solo elimina claves propias de Nodaria.
- No se han añadido eventos, rutas ni datos al script. La web no tiene CSP ni service worker.
- La web no tiene política de privacidad. Si se crea una, debe mencionar esta medición (anotado en `docs/codex/PROJECT_CONTEXT.md`).

### Cómo se identifica al propietario

El propietario indicó su cuenta: un UID de Firebase, que está en `OWNER_FIREBASE_UIDS` del `.env` del servidor. Para añadir más cuentas basta con ampliar esa lista y reiniciar la API (`api/ops/restart-api.ps1`).

### Verificación de `INTEGRACION.md` en producción

Comprobado el 2026-10-07:

- `https://estadisticas.yosiftware.es/health` → 200. `s.js` → 200 (`application/javascript`).
- `https://nodaria.yosiftware.es/` sirve el `<script defer>` en el `<head>` y no envía cabecera Content-Security-Policy.
- `nodaria.yosiftware.es` figura en la lista `HOSTS` del script servido.
- **Paso 4**: revisado el `s.js` vigente. Los cuerpos enviados a `/v1/e` solo llevan `v`, `t` (`inicio`/`latido`/`fin`), un token de visita aleatorio, `seg` y los indicadores `d`/`s`/`m`. No incluyen URL, ruta, usuario ni otros datos de Nodaria, y se envían con `credentials: "omit"`.
- API en producción reiniciada con el build nuevo (`/api/health` → 200). El proceso carga `OWNER_FIREBASE_UIDS` con la cuenta del propietario y `/api/me` sin token responde 401. No se pudo llamar a `/api/me` con un token real desde el servidor: generar un token de prueba requiere activar la API de IAM en Google Cloud, y no se cambió esa configuración. La ruta queda cubierta por la prueba automatizada.
- **Paso 2** (propietario, 2026-10-07): tras iniciar sesión con su cuenta en producción, `localStorage["yosiftadisticas:excluir"]` vale `"1"`. Esto confirma de extremo a extremo que `/api/me` devuelve `excludeFromStats: true` para su UID y que el front guarda la marca.
- **Paso 3** (propietario, 2026-10-07): al recargar con la marca puesta no sale ninguna petición a `/v1/e`.
- **Paso 1** (propietario): visita real desde el móvil con datos móviles, hecha por el propietario.

Las cuatro comprobaciones de `INTEGRACION.md` quedan completadas.
