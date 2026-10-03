# Nodaria

Aplicación local para crear mapas mentales estructurados mediante esquemas, entidades y relaciones.

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

Los proyectos siguen almacenándose en `localStorage` bajo la clave histórica `nodaria_state_v1`, por lo que la actualización conserva los datos existentes. Los proyectos se migran al formato actual (`src/services/migrations.ts`) y se reparan al cargarlos. La importación acepta tanto exportaciones antiguas como las de la versión actual.
