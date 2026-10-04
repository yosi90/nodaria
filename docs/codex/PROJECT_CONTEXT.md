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
- Estilos en `src/styles/`: `tokens.css` (temas claro y oscuro mediante variables, con `[data-theme]` y `prefers-color-scheme`), `base.css`, `components.css`, `overlays.css` (modales, popovers, toasts) y `layout.css` (armazón, mapa, tipos). Ningún color va fijo en los componentes: siempre se usan tokens.
- Componentes comunes en `src/components/common/`: botones, `Select`/`MultiSelect` con búsqueda, `Menu`, `Popover` (se monta dentro del `<dialog>` abierto si lo hay), diálogos `useDialogs()`, `useToast()`, `Splitter` y catálogo de iconos de tipo (`icon-catalog.ts`).
- Preferencias de interfaz (tema, anchura y plegado de paneles) en `src/state/preferences.tsx`, con la clave `nodaria_ui_v1`, separadas de los proyectos.
- Navegación en `src/state/navigation.tsx`: vista activa, selección con historial atrás/adelante, señal de «centrar en el lienzo» y estado de la paleta (Ctrl+K, `src/components/layout/CommandPalette.tsx`).
- Operaciones de dominio puras e inmutables en `src/domain/operations.ts`; reglas de jerarquía, herencia y compatibilidad en `src/domain/selectors.ts`; reparación de datos incoherentes en `src/domain/integrity.ts`.
- Estado: `src/state/reducer.ts` (acciones a operaciones de dominio), `src/state/history.ts` (deshacer/rehacer con agrupación de ediciones) y `src/state/AppContext.tsx` (provider, guardado con retardo y volcado al ocultar o cerrar la página).
- Migraciones versionadas en `src/services/migrations.ts`; `src/services/storage.ts` migra y repara todo lo que se carga o importa.
- Pruebas con Vitest junto al código (`*.test.ts`) y constructores comunes en `src/test/fixtures.ts`. Formato con Prettier (`.prettierrc.json`).
- **Backend** en `api/` (desde el 2026-10-04): Node 24 + TypeScript + Fastify, mismo patrón que `mazos lorcana/back`. Valida el ID token de Firebase (`firebase-admin`) en cada ruta privada, guarda en SQL Server Express local (`localhost\SQLEXPRESS`, base `Nodaria`, autenticación de Windows) y escucha solo en `127.0.0.1:5003`. Migraciones SQL en `api/migrations/`; pruebas con Vitest en `api/test/`; guía operativa en `docs/backend/README.md`. El lint de la raíz cubre `api/` con globales de Node. El front todavía no lo usa.
- Dependencias de desarrollo añadidas en la Fase 0: `vitest@5.0.3` y `prettier@3.9.9`. Dependencias de la Fase 1: `lucide-react@1.51.0`, `@fontsource-variable/inter@5.3.0` y `@fontsource-variable/fraunces@5.3.0`. Fase 2: `@xyflow/react@12.12.0` (lienzo), `d3-force@3.0.0` y `d3-hierarchy@3.1.2` (disposiciones), con sus `@types`.
- Lienzo en `src/components/map/FlowCanvas.tsx` (React Flow) con tarjeta `NodeCard`, arista `FloatingEdge` (geometría en `edgeGeometry.ts`), disposiciones puras en `layout.ts`, leyenda y menú de relación al conectar. Las posiciones del lienzo y la vista viven en el proyecto; el resaltado de vecinos se aplica sobre el DOM por rendimiento.

## Modelo de dominio actual

- `Project`: agrupa esquemas, nodos, relaciones, `lenses` (vistas guardadas: configuración del mapa y posiciones opcionales) y `view` (estructura elegida, disposición, filtros y modo foco del mapa; se guarda y exporta, pero no entra en el historial de deshacer).
- `Schema`: define una entidad o una relación, sus atributos, herencia y restricciones, además de su color e icono (`icon` es un nombre del catálogo de la interfaz; si falta, la migración pone uno por defecto).
- `FieldDefinition`: describe un atributo tipado, requerido, calculado o usado como título. Tipos: texto, texto largo, número, sí/no, fecha, lista, referencia (uno o varios nodos), calculado e imagen (data URL reducida a 384 px).
- **Biblioteca de atributos** («Propiedades» o preformas en la interfaz; `Project.fieldLibrary`, `src/domain/library.ts`): `Schema.fields` es una lista de `SchemaField`, que puede ser una definición propia o un vínculo `{ ref }` a un atributo compartido. `declaredFields` resuelve los vínculos; `allFields` añade los heredados, sustituyendo por clave solo entre niveles de herencia. Compartir o desvincular no cambia el id del atributo, así que los valores de los nodos se conservan.
- `Node`: instancia un esquema de entidad, puede pertenecer a un padre jerárquico y guarda `position` (fijada por el usuario) o `null` (la coloca la disposición automática). La jerarquía nunca puede tener ciclos y el padre debe admitir el tipo del hijo (`allowedChildTypeIds`, con herencia).
- Los valores de nodos y relaciones se indexan por `FieldDefinition.id` (formato v3). `key` es un alias legible que usan las fórmulas.
- Un tipo con instancias o subtipos no puede cambiar de clase. La herencia no admite ciclos ni padres de otra clase.
- Borrar un tipo hace que sus subtipos hereden del abuelo, limpia las restricciones que lo citaban y sube o borra (a elección) los subnodos de otros tipos. Borrar nodos vacía las referencias `nodeRef`/`nodeRefs` que apuntaban a ellos.
- `Relation`: conecta un nodo de origen con uno de destino e instancia un esquema de relación. Su nombre propio describe el papel del origen; `reverseName` (o `Schema.inverseName`) el del destino en relaciones dirigidas (`relationRole`). `Schema.reciprocal` marca las dirigidas recíprocas (flecha doble); `Schema.genealogical` hace que la relación use `Relation.kinshipId` del vocabulario `Project.kinship` (`src/domain/kinship.ts`), con papeles por género (`nodeGender`, atributo de tipo `gender`) y contraparte; el lienzo etiqueta cada arista con el papel del extremo opuesto al nodo bajo el puntero (los dos papeles van en `data-role-source`/`data-role-target` y el efecto de hover cambia el texto).
- **Referencias** (`src/domain/references.ts`): los atributos `nodeRef`/`nodeRefs` son vínculos de pleno derecho: se dibujan en el lienzo, cuentan en `nodeConnections` y definen estructuras `field:<id>` en «Ver por». Regla de uso: atributo de referencia para propiedades del nodo (ciudad, dios), relación para vínculos con datos propios o entre iguales.
- **Notas** (`Node.notes`, `src/domain/notes.ts`): texto libre con menciones `[[Nombre]]` resueltas por título (sin mayúsculas ni acentos); las menciones cuentan como conexiones.
- `src/domain/connections.ts` reúne todo lo que conecta a un nodo (jerarquía, relaciones, referencias, menciones) para la pestaña Conexiones.
- **Estructuras** (`src/domain/structure.ts`): la jerarquía «Dentro de» (`parentId`) es la estructura base. Un tipo de relación con `structural: true` define otra, con `parentEnd` indicando qué extremo es el superior; en ellas un nodo puede colgar de varios superiores. El árbol («Ver por») y la disposición jerárquica usan la estructura elegida en `Project.view.structureId`.

`Project.formatVersion` indica la versión del formato (actual: 4, posiciones fijadas por disposición en `Node.positions[layout]`; los datos sin versión se tratan como v2). `AppState.version` es 3. La clave histórica de persistencia es `nodaria_state_v1`. Debe mantenerse mientras sea posible para conservar los proyectos creados con la versión monolítica anterior.

## Estado técnico

- La aplicación monolítica original fue migrada a React, TypeScript y Vite.
- El build y el lint están configurados.
- Hay pruebas automatizadas con Vitest (`npm test`) para dominio, migraciones, importación/exportación e historial.
- Hay deshacer/rehacer global. Cambiar de proyecto no ocupa un paso.
- Los datos dañados (ciclos, padres o extremos inexistentes, tipos borrados) se reparan al cargar o importar, y se avisa al usuario.
- La persistencia del front sigue siendo exclusivamente local. La API (`api/`) existe con cuentas (`/api/me`) y la base `Nodaria` creada (tablas `users`, `projects`, `messages`, `notificapp_outbox`), y rutas de proyectos (`/api/projects`, documento JSON por proyecto con control de versión), pero la integración en el front está pendiente (`docs/roadmaps/ROADMAP_BACKEND.md`).
- No quedan diálogos nativos: confirmaciones y peticiones de texto usan `useDialogs()`, y los borrados ofrecen "Deshacer" mediante un toast.

## Vista «Tabla»

- `src/components/table/TableView.tsx`: hoja por tipo de entidad, editable en celda; reutiliza `FieldControl` (extraído del inspector a `src/components/map/FieldControl.tsx`). Preferencias por proyecto y tipo en `preferences.tables` (columnas ocultas, orden).

## Duplicar y tipos de campo

- `duplicateNode(p, id, withRelations)` y `duplicateSchema(p, id)` en `src/domain/operations.ts` (acciones `duplicate-node` / `duplicate-schema`); nombre «(copia)» sin repetir, posiciones fijadas desplazadas, atributos del tipo con ids nuevos.
- Tipos de campo `url`, `color`, `scale` (1–5) y `tags` (string[]); los controles viven en `FieldControl` (TagsInput compartido en `src/components/common/TagsInput.tsx`).

## Disposición «Mapa»

- `Project.mapImage` (data URL JPEG hasta 2400 px de lado, con `width`/`height`) es el fondo de la disposición `image`; `MapImageLayer` lo pinta en el origen del lienzo con `ViewportPortal`, `MapImageMenu` lo sube/cambia/quita (`set-map-image`, deshacible). `trayLayout` coloca en una bandeja bajo la imagen los nodos sin posición fijada en esa disposición.

## Exportación de imagen

- `src/components/map/ExportMenu.tsx` usa `html-to-image` (`toPng` / `toSvg`) sobre `.react-flow__viewport`; «todo el mapa» recalcula el transform a escala 1 con margen fijo (máximo 8192 px) y «vista actual» captura el encuadre en pantalla.

## Despliegue

- Firebase Hosting, proyecto `yosiftware-nodaria` (creado el 2026-10-03): https://yosiftware-nodaria.web.app y dominio propio https://nodaria.yosiftware.es (DNS en Cloudflare, gestionado por el usuario). `npm run deploy` compila y publica con el `firebase-tools` instalado en `api/` (requiere `npm ci` en `api/` y sesión de Firebase o cuenta de servicio). Los datos siguen siendo locales del navegador: hostear no cambia la persistencia.
- Desde el 2026-10-04 el desarrollo ocurre en el servidor de Yosiftware (el mismo que aloja Libros, Fichas, Lorcana y Notificapp). La API se publica como `https://nodaria-api.yosiftware.es` por el túnel de Cloudflare existente (ingress y CNAME creados el 2026-10-04; pendiente reiniciar `Cloudflared` con `api/ops/install-autostart.ps1` como administrador) y corre con el vigilante `api/ops/run-api.ps1` (arrancado a mano hasta registrar la tarea programada). App web de Firebase «Nodaria Web» registrada el 2026-10-04; su configuración pública está en `docs/backend/README.md`.
- Notificapp: el kit copiable vive en `plugin-kit/` (ignorado por Git). El plugin propio irá en `notificapp-plugin/` (Fase 3). Los avisos de agente usan el emisor del servidor; ver `AGENTS.md`.

## Roadmap activo

`docs/roadmaps/ROADMAP_BACKEND.md` (creado el 2026-10-04): backend, cuentas, sincronización entre dispositivos, mensajes de usuarios y Notificapp, por fases. Fases 0 y 1 completadas el 2026-10-04 (Firebase configurado, cuenta de servicio en `api/secrets/`, API probada de extremo a extremo). Las fases de mensajes y plugin de Notificapp quedan aplazadas por decisión del propietario: la web no monta peticiones por ahora.

`docs/roadmaps/ROADMAP_RENOVACION.md` (creado el 2026-10-03) queda en pausa como referencia: renovación completa en fases (estabilidad, diseño, lienzo, fichas y navegación, modelo, vistas, análisis, persistencia, IA opcional). Quedaban pendientes campos calculados reales y restricciones de cardinalidad en relaciones.

## Prioridades conocidas

- Mejorar la visualización para mapas grandes: zoom, paneo, disposición y filtros avanzados.
- Evolucionar la interfaz a partir de casos reales sin acoplar el dominio a la escritura de ficción.
