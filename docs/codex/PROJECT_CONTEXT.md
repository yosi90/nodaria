# Project Context

## Producto

Nodaria es una aplicación web generalista para representar visualmente árboles de nodos y las relaciones entre ellos. Combina una jerarquía tipo mapa mental con esquemas configurables, atributos, herencia y relaciones transversales entre nodos.

El producto no está limitado a un sector concreto. Debe poder adaptarse a escritura, investigación, planificación, documentación de sistemas, construcción de mundos y otros problemas que se beneficien de visualizar entidades conectadas.

### Caso de uso de referencia

El caso de uso principal del creador es apoyar la escritura de un libro:

- representar personajes, lugares, organizaciones, acontecimientos o conceptos como nodos;
- describirlos mediante atributos configurables;
- organizar elementos mediante una jerarquía;
- representar relaciones familiares, sociales, narrativas o causales;
- detectar zonas poco desarrolladas de la historia;
- descubrir personajes o conexiones que faltan;
- identificar personajes redundantes o elementos que no aportan a la estructura.

Este caso sirve para validar decisiones de producto y diseñar ejemplos, pero el modelo debe mantenerse generalista. No se deben introducir conceptos narrativos obligatorios en el núcleo del dominio.

## Principios de producto

- El usuario define sus propios tipos de entidad y de relación.
- Los esquemas aportan estructura sin impedir la exploración visual.
- La jerarquía y las relaciones son conceptos distintos: un nodo puede tener un padre en el árbol y, a la vez, múltiples relaciones transversales.
- La visualización debe ayudar a descubrir patrones, huecos, redundancias y puntos de alta conexión.
- Los datos pertenecen al usuario y deben poder exportarse e importarse de forma comprensible.
- La aplicación debe seguir siendo útil sin infraestructura de servidor mientras no exista una necesidad clara de colaboración o sincronización.

## Arquitectura actual

- React 19 y TypeScript en modo estricto.
- Vite como servidor de desarrollo y herramienta de build.
- Estado global mediante Context y reducer en `src/state/AppContext.tsx`.
- Persistencia local mediante `localStorage` en `src/services/storage.ts`.
- Modelo y reglas reutilizables en `src/domain/`.
- Interfaz dividida entre mapa, árbol, inspector, esquemas y layout en `src/components/`.
- Estilos globales en `src/styles/index.css`, con hojas por zona (`overlays.css`, `schema-fields.css`, `graph-tooltip.css`).
- Operaciones de dominio puras e inmutables en `src/domain/operations.ts`; reglas de jerarquía, herencia y compatibilidad en `src/domain/selectors.ts`; reparación de datos incoherentes en `src/domain/integrity.ts`.
- Estado: `src/state/reducer.ts` (acciones a operaciones de dominio), `src/state/history.ts` (deshacer/rehacer con agrupación de ediciones) y `src/state/AppContext.tsx` (provider, guardado con retardo y volcado al ocultar o cerrar la página).
- Migraciones versionadas en `src/services/migrations.ts`; `src/services/storage.ts` migra y repara todo lo que se carga o importa.
- Pruebas con Vitest junto al código (`*.test.ts`) y constructores comunes en `src/test/fixtures.ts`. Formato con Prettier (`.prettierrc.json`).
- Dependencias de desarrollo añadidas en la Fase 0: `vitest@5.0.3` y `prettier@3.9.9`.

## Modelo de dominio actual

- `Project`: agrupa esquemas, nodos y relaciones.
- `Schema`: define una entidad o una relación, sus atributos, herencia y restricciones.
- `FieldDefinition`: describe un atributo tipado, requerido, calculado o usado como título.
- `Node`: instancia un esquema de entidad y puede pertenecer a un padre jerárquico. La jerarquía nunca puede tener ciclos y el padre debe admitir el tipo del hijo (`allowedChildTypeIds`, con herencia).
- Los valores de nodos y relaciones se indexan por `FieldDefinition.id` (formato v3). `key` es un alias legible que usan las fórmulas.
- Un tipo con instancias o subtipos no puede cambiar de clase. La herencia no admite ciclos ni padres de otra clase.
- Borrar un tipo hace que sus subtipos hereden del abuelo, limpia las restricciones que lo citaban y sube o borra (a elección) los subnodos de otros tipos. Borrar nodos vacía las referencias `nodeRef`/`nodeRefs` que apuntaban a ellos.
- `Relation`: conecta un nodo de origen con uno de destino e instancia un esquema de relación.

`Project.formatVersion` indica la versión del formato (actual: 3; los datos sin versión se tratan como v2). `AppState.version` es 3. La clave histórica de persistencia es `nodaria_state_v1`. Debe mantenerse mientras sea posible para conservar los proyectos creados con la versión monolítica anterior.

## Estado técnico

- La aplicación monolítica original fue migrada a React, TypeScript y Vite.
- El build y el lint están configurados.
- Hay pruebas automatizadas con Vitest (`npm test`) para dominio, migraciones, importación/exportación e historial.
- Hay deshacer/rehacer global. Cambiar de proyecto no ocupa un paso.
- Los datos dañados (ciclos, padres o extremos inexistentes, tipos borrados) se reparan al cargar o importar, y se avisa al usuario.
- La persistencia sigue siendo exclusivamente local.
- La creación de tipos y relaciones utiliza modales propios; la creación de nodos usa un menú contextual con tipos válidos. El modal de relaciones valida origen y destino contra las restricciones del esquema antes de permitir la creación.

## Roadmap activo

`docs/roadmaps/ROADMAP_RENOVACION.md` (creado el 2026-10-03): renovación completa en fases (estabilidad, diseño, lienzo, fichas y navegación, modelo, vistas, análisis, persistencia, IA opcional). Incluye los bugs críticos detectados: ciclos de jerarquía que cuelgan la app, hijos huérfanos al borrar un tipo y pérdida de valores al renombrar la clave de un atributo. Las prioridades de abajo quedan integradas en él.

## Prioridades conocidas

- Sustituir progresivamente los diálogos nativos secundarios que todavía quedan en acciones de proyecto y confirmaciones destructivas.
- Mejorar la visualización para mapas grandes: zoom, paneo, disposición y filtros avanzados.
- Evolucionar la interfaz a partir de casos reales sin acoplar el dominio a la escritura de ficción.
