# Nodaria

Aplicación web para crear mapas mentales estructurados mediante esquemas, entidades y relaciones. Funciona en local (datos en el navegador) y, con una cuenta opcional, sincroniza los proyectos entre dispositivos mediante la API de `api/` (ver `docs/backend/README.md` y `docs/roadmaps/ROADMAP_BACKEND.md`).

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Pruebas, lint y formato:

```bash
npm test
npm run lint
npm run format
```

Para generar la versión de producción:

```bash
npm run build
npm run preview
```

## Arquitectura

- `src/domain`: modelo, reglas, selectores y fábricas sin dependencias de React.
- `src/services`: persistencia e importación de datos.
- `src/state`: estado global y acciones de la aplicación.
- `src/components`: interfaz separada por funcionalidad (`layout`, `map`, `schema`, `common`).
- `src/styles`: estilos globales y diseño adaptable.
- `api/`: API Fastify + TypeScript con Firebase Authentication y SQL Server Express (`cd api && npm ci && npm run migrate && npm run dev`).

Los proyectos se almacenan en IndexedDB (base `nodaria`, un registro por proyecto), sin el límite de unos 5 MB de `localStorage`. La primera carga migra lo que hubiera en `localStorage` bajo la clave histórica `nodaria_state_v1` y guarda el original como copia, por lo que la actualización conserva los datos existentes. Con sesión iniciada (Firebase Authentication: correo y contraseña o Google), además se guardan en la cuenta y se sincronizan entre dispositivos; el recuerdo de lo sincronizado vive en `nodaria_sync_v1`. Los proyectos se migran al formato actual (`src/services/migrations.ts`) y se reparan al cargarlos. La importación acepta tanto exportaciones antiguas como las de la versión actual.

## Despliegue

La web se publica en Firebase Hosting (proyecto `yosiftware-nodaria`): https://yosiftware-nodaria.web.app, con dominio propio https://nodaria.yosiftware.es (DNS en Cloudflare).

```bash
npm run deploy
```

Usa el `firebase-tools` instalado en `api/` (ejecuta antes `npm ci` en `api/`) con sesión iniciada (`firebase login`) o cuenta de servicio. La configuración está en `firebase.json` (carpeta `dist`, reescritura a `index.html` y caché inmutable de `assets/`).
