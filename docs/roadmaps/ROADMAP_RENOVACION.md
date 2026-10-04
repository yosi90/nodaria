# Roadmap: renovación de Nodaria

> Roadmap activo principal. Creado el 2026-10-03 tras un estudio completo del código.
> Mantener la checklist sincronizada con el estado real durante la ejecución.

## Objetivo

Convertir Nodaria de una herramienta "cumplidora" en un **atlas navegable de un mundo**: un espacio donde se puedan crear entidades (personajes, lugares, dioses, escuelas de magia, facciones…), conectarlas y, sobre todo, **ver, recorrer y analizar** esas conexiones con claridad.

Preguntas que la aplicación debe responder en segundos cuando termine este roadmap:

- ¿Quién es el dios de este personaje, a qué lugar pertenece y qué magia practica?
- ¿Con quién está conectado este personaje, directa o indirectamente?
- ¿Cómo se relacionan A y B? (camino más corto)
- ¿Qué personajes no están conectados con nada? ¿Qué fichas están a medio hacer?
- ¿Qué personajes ocupan el mismo hueco narrativo (redundancia)?
- ¿Cómo se ve solo la genealogía, solo el panteón o solo la geografía?

El núcleo sigue siendo generalista: nada de lo anterior introduce conceptos narrativos obligatorios en el dominio. Lo específico de fantasía llega como **plantilla opcional**.

## Alcance

Incluido: estabilidad e integridad de datos, sistema de diseño, lienzo de grafo interactivo, fichas y navegación, modelo de datos enriquecido, vistas alternativas (tabla, matriz, genealogía, mapa, línea temporal), análisis del grafo, persistencia robusta y exportaciones, asistente IA opcional.

Excluido (por ahora): colaboración en tiempo real y aplicación móvil nativa. Servidor propio, cuentas de usuario y sincronización pasaron a `ROADMAP_BACKEND.md` (2026-10-04), finalizado ese mismo día; este vuelve a ser el roadmap activo.

## Hallazgos del estudio

### Bugs que pueden romper la aplicación o perder datos

| #   | Problema                                                                                                                          | Dónde                                                     | Consecuencia                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | El selector "Padre" ofrece los propios descendientes del nodo. Elegir uno crea un ciclo.                                          | `src/components/map/Inspector.tsx`                        | `depth()` en `GraphCanvas` recurre sin fin → la app se cuelga. Como el estado se guarda, **se cuelga también en cada recarga** (el mapa es la vista inicial). |
| B2  | Borrar un tipo borra sus nodos pero no reasigna a sus hijos (de otros tipos).                                                     | `reducer` → `delete-schema` en `src/state/AppContext.tsx` | Los hijos quedan con `parentId` inexistente: desaparecen del árbol y `GraphCanvas` lanza `TypeError` en `positions.get(...)!.x` → **pantalla en blanco**.     |
| B3  | Los valores se guardan por `field.key`. Renombrar la clave interna de un atributo deja huérfanos los datos ya introducidos.       | `FieldEditor.tsx`, `Node.values`                          | Pérdida silenciosa de datos en todas las instancias.                                                                                                          |
| B4  | Cambiar un tipo de "Entidad" a "Relación" (o al revés) no comprueba instancias.                                                   | `SchemaEditor.tsx`                                        | Nodos cuyo tipo es una relación; relaciones cuyo tipo es una entidad.                                                                                         |
| B5  | Borrar un tipo deja IDs colgantes en `allowedChildTypeIds`, `sourceTypeIds`, `targetTypeIds` y `referenceTypeIds` de otros tipos. | `delete-schema`                                           | Restricciones fantasma; listas vacías se interpretan como "todo permitido".                                                                                   |
| B6  | La herencia de tipos permite ciclos (A hereda de B, B de A).                                                                      | `SchemaEditor.tsx`                                        | No cuelga (hay guarda en `inheritedSchemas`), pero produce campos y compatibilidad incoherentes.                                                              |

### Carencias funcionales importantes

- **Los campos `nodeRef` / `nodeRefs` no tienen control de edición**: caen en un `<input type="text">`, así que habría que escribir IDs a mano. Es justo el tipo de campo que respondería "¿quién es su dios?".
- **El inspector no muestra las relaciones del nodo** (ni salientes ni entrantes) ni las referencias desde otros nodos. No hay forma de navegar de un personaje a sus conexiones salvo buscarlas en el lienzo.
- El selector de padre ignora `allowedChildTypeIds` (el menú de creación sí lo respeta).
- Los valores por defecto solo se aplican con los campos propios del tipo, no con los heredados, y siempre se guardan como texto (también en número y sí/no).
- Los campos calculados no muestran su valor en el inspector (salen como "…").
- Los campos obligatorios no se validan en ningún sitio.
- `directed` no se dibuja: no hay flechas. Los estilos de relación apenas se distinguen.
- Las relaciones no tienen nombre por dirección ("padre de" / "hijo de"), y una relación no dirigida no aparece de forma simétrica en ningún listado.
- No hay deshacer/rehacer. Un borrado en cascada de un tipo es irreversible.
- Quedan `prompt`, `confirm` y `alert` nativos (proyecto y borrados).

### Visualización

- El "layout" coloca los nodos en columnas por profundidad y filas por orden de creación: el hijo no queda junto a su padre y las relaciones transversales no influyen en la disposición.
- Sin zoom, paneo, arrastre de nodos ni posiciones persistentes.
- Las relaciones se dibujan como arcos desde el borde inferior de cada nodo; con más de unos pocos nodos se cruzan y las etiquetas se solapan.
- No hay leyenda, minimapa, resaltado de vecinos ni modo foco.
- `NodeTooltip` está definido dentro de `GraphCanvas` y se vuelve a montar en cada render.

### Técnica

- Cada pulsación de tecla clona el estado completo (`structuredClone`) y lo serializa en `localStorage`. Con un mundo grande será lento, y `localStorage` tiene un límite de unos 5 MB (incompatible con imágenes).
- No hay versionado de migraciones: `normalizeProject` hace de migración implícita.
- No hay pruebas automatizadas.
- Varios archivos están escritos en una sola línea muy larga (Inspector, TreePanel, Topbar, AppContext, storage, selectors), lo que dificulta revisar y mantener el código.
- `tsconfig.*.tsbuildinfo` está versionado en Git.

### Diseño

- Tema oscuro correcto pero genérico; sin jerarquía visual clara entre paneles.
- Iconos con caracteres Unicode (＋, ✎, 🗑, ▸) en lugar de un set coherente.
- Paneles de anchura fija (320 / flexible / 350 px) sin posibilidad de redimensionar o plegar; en pantallas medianas el lienzo queda estrecho.
- Los nodos son rectángulos de 170×58 con el nombre recortado a 22 caracteres; no hay retrato, icono ni indicación del número de conexiones.
- Selects múltiples nativos para elegir tipos (incómodos y poco legibles).

## Decisiones

| Decisión                                                                                                                                          | Motivo                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guardar valores por `field.id`** en lugar de `field.key`, con migración. La clave se mantiene para fórmulas y exportación legible.              | Arregla B3 de raíz y permite renombrar libremente.                                                                                                                                 |
| **Vitest** como infraestructura de pruebas.                                                                                                       | Integración nativa con Vite; las reglas de dominio necesitan red de seguridad antes de crecer.                                                                                     |
| **Prettier** para formatear el código existente, en un commit aislado sin cambios de comportamiento.                                              | Los archivos de una línea hacen imposible revisar los diffs de las fases siguientes.                                                                                               |
| **IndexedDB** (vía `idb-keyval` o API nativa) como almacenamiento principal, conservando la lectura de `nodaria_state_v1` para migrar.            | Sin límite práctico de 5 MB, permite imágenes y copias automáticas.                                                                                                                |
| **`@xyflow/react` (React Flow)** para el lienzo, y **`d3-force`** + un layout jerárquico (`elkjs` o `dagre`) para la disposición automática.      | Zoom, paneo, arrastre, minimapa, conexiones arrastrando y rendimiento con cientos de nodos ya resueltos y probados. Reimplementarlo sobre SVG propio costaría semanas sin ventaja. |
| **Iconos con `lucide-react`**.                                                                                                                    | Set coherente, ligero y con _tree-shaking_.                                                                                                                                        |
| **Sin librería de estado externa** por ahora: reducer actual + historial para deshacer, con las operaciones movidas a funciones de dominio puras. | El Context/reducer basta; el problema es dónde vive la lógica, no la herramienta.                                                                                                  |
| **Lo específico de fantasía va en plantillas** ("Mundo de fantasía", "Novela", "Proyecto vacío"), no en el dominio.                               | Respeta el principio generalista del producto.                                                                                                                                     |
| **El asistente IA es opcional y con clave propia**, nunca necesario para usar la app.                                                             | Los datos son del usuario; la app debe funcionar sin red.                                                                                                                          |

Cada dependencia nueva se añade en la fase que la necesita, con versión fijada y documentada en `PROJECT_CONTEXT.md`.

## Fases

Las fases están ordenadas por dependencia y valor. La **Fase 0 es urgente** (hay bugs que inutilizan la app con los datos guardados). A partir de la Fase 2 se podría reordenar según lo que más falte durante la escritura.

### Fase 0 — Estabilidad e integridad de datos

Objetivo: que ninguna acción del usuario pueda romper la app ni perder datos.

- [x] Formatear el código con Prettier (`npm run format`). _No se pudo aislar en un commit propio: el árbol ya tenía cambios sin commitear del usuario._
- [x] Introducir Vitest (`npm test`) y pruebas para selectores, operaciones, integridad, migraciones, importación/exportación e historial.
- [x] Mover la lógica del reducer a funciones de dominio puras y probadas (`src/domain/operations.ts`).
- [x] B1: impedir ciclos de jerarquía (excluir descendientes en el selector de padre; validación de dominio `canSetParent`). Guarda anti-ciclo en todo cálculo de profundidad.
- [x] B2: al borrar un tipo, un modal muestra el impacto y pregunta si subir o borrar los subnodos de otros tipos. Borrar un nodo sigue siendo en cascada, pero la confirmación indica cuántos subnodos caen.
- [x] B3: migrar `values` de `key` a `field.id`; la clave pasa a ser solo un alias.
- [x] B4: el cambio de clase se bloquea si hay instancias o subtipos.
- [x] B5: limpiar referencias colgantes al borrar tipos.
- [x] B6: impedir ciclos de herencia.
- [x] Reparación al cargar: detectar y corregir datos ya corruptos (ciclos, padres inexistentes, referencias huérfanas) y avisar de lo corregido.
- [x] Migraciones versionadas (`Project.formatVersion`, un paso por versión en `src/services/migrations.ts`).
- [x] Guardado con _debounce_ y sin clonar todo el estado por cada tecla.
- [x] Deshacer / rehacer (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y y botones en la barra superior), 100 pasos, con las ediciones seguidas de un mismo elemento agrupadas.
- [x] Sacar `*.tsbuildinfo` y el `vite.config.js` generado del repositorio (Vite cargaba ese `.js` antes que `vite.config.ts`).

Criterio: las pruebas cubren las reglas de dominio; no hay forma conocida de colgar la app; un proyecto corrupto se repara al abrirlo.

Notas de cierre (2026-10-03):

- Verificado en Chromium sin interfaz (Playwright): un `localStorage` v2 con un ciclo de jerarquía y un padre inexistente se carga, se repara y muestra el aviso. Los valores migran a ids de campo. Borrar, deshacer y rehacer funcionan, el selector de padre excluye los descendientes y el modal de borrado de tipos funciona, todo ello sin errores en consola.
- El selector de padre ahora respeta `allowedChildTypeIds` (antes ofrecía cualquier nodo), y el padre actual se mantiene visible aunque incumpla las reglas.
- Los valores por defecto ahora se heredan y se tipan. Los campos calculados muestran su valor en el inspector.
- Se retiró el botón "Guardar cambios" del inspector: la edición ya se guardaba al momento.
- Pendiente para fases posteriores: las fórmulas usan `{clave}`, así que renombrar una clave rompe las fórmulas que la citan (los datos ya no se pierden). Cambiar el tipo de un campo no convierte los valores existentes.

### Fase 1 — Sistema de diseño y armazón

Objetivo: que se vea como una herramienta cuidada y que el resto de fases construya sobre piezas comunes.

- [x] Tokens de diseño en `src/styles/tokens.css`: escala tipográfica, espaciados, radios, sombras, superficies por nivel y colores semánticos.
- [x] Tema claro ("papel"), oscuro ("tinta") y del sistema, recordado por navegador. Contraste AA medido en todos los pares de texto: el texto sutil más bajo da 4,8:1.
- [x] Tipografía local (sin depender de la red): Inter Variable para la interfaz y Fraunces Variable para los títulos.
- [x] Iconos `lucide-react` en toda la interfaz. Cada tipo elige uno de 70 iconos (`Schema.icon`) y un color con muestras o selector libre.
- [x] Componentes comunes en `src/components/common/`: `Button`/`IconButton` (con tooltip), `Select` con búsqueda, `MultiSelect` con chips, `Menu`, `Popover`, `OptionList`, `Modal` con variante de peligro, diálogos `useDialogs()` (confirmar y pedir texto), `useToast()`, `EmptyState` y `Splitter`. El control segmentado, los badges y los chips son clases CSS. _Los `input` nativos se mantienen con un estilo común: no hacía falta un componente propio._
- [x] Eliminar `prompt`, `confirm` y `alert` nativos.
- [x] Paneles redimensionables (ratón y flechas) con anchura recordada. La estructura se pliega con `[`; el inspector solo ocupa sitio cuando hay algo seleccionado.
- [x] Barra superior: menú de proyecto (cambiar, nuevo, renombrar, duplicar, importar, exportar, eliminar), control segmentado de vistas con iconos, deshacer/rehacer, tema y ayuda.
- [x] Toasts con "Deshacer" al borrar nodos, relaciones, atributos y proyectos. Solo se ofrece mientras esa acción siga siendo la última del historial.
- [x] Atajos de teclado y panel de ayuda (`?`, Alt+1/2, `[`, Esc, Supr).
- [x] Accesibilidad: foco visible, árbol con el patrón ARIA `tree` (flechas, Inicio/Fin, Intro), menús y listas navegables con flechas, y nodos del lienzo enfocables.

Criterio: no quedan diálogos nativos; toda la UI usa los componentes comunes; ambos temas se ven bien.

Notas de cierre (2026-10-03):

- Verificado en Chromium (Playwright) con un mundo de ejemplo, sin errores ni diálogos nativos: selección e inspector, selectores con búsqueda, confirmación al borrar con subnodos, Supr con "Deshacer" desde el toast, "Añadir subnodo", navegación del árbol con teclado, plegado con `[`, modal de relaciones, renombrado desde el menú, cambio de tema, edición de tipos (icono, opciones, subnodos permitidos), creación de un tipo de relación, ayuda y persistencia de preferencias tras recargar.
- Extras de la fase: el nodo recién creado queda seleccionado (`add-node` y `add-schema` aceptan un id generado de antemano). El modal de "Crear tipo" permite elegir entidad o relación. La ficha del tipo muestra los atributos heredados. Las flechas de las relaciones dirigidas toman el color de su tipo.
- Bug corregido: en el campo "Opciones" de una lista no se podía escribir una coma. Ahora es un editor de chips (Intro o coma para añadir).
- Dependencias añadidas: `lucide-react@1.51.0`, `@fontsource-variable/inter@5.3.0` y `@fontsource-variable/fraunces@5.3.0`.

Correcciones tras la revisión del usuario (2026-10-03):

- Las relaciones ahora usan su título propio (`relationLabel`) en el lienzo, el inspector y los avisos, y el nombre del tipo solo si no tienen uno. Sin campo marcado como título, se usa el primer campo de texto con valor; esto también vale para los nodos (`ownTitle`).
- Las líneas de relación unían los bordes inferiores de los nodos y cruzaban por detrás de los nodos apilados. Ahora van de borde a borde (`src/components/map/edgeGeometry.ts`), las paralelas se abren en abanico, se curvan para esquivar las tarjetas que hay en medio, las etiquetas se apartan de la línea y el lienzo se dimensiona incluyendo curvas y etiquetas.
- Firefox con `privacy.resistFingerprinting` siempre informa de tema claro, así que el modo «sistema» no puede detectar el oscuro. Se puede fijar el tema a mano.

### Fase 2 — Lienzo de grafo de verdad

Objetivo: ver el mundo y moverse por él.

- [x] Lienzo migrado a React Flow (`src/components/map/FlowCanvas.tsx`): zoom, paneo, arrastre, minimapa y controles. _La selección múltiple se deja para más adelante: el inspector y el historial trabajan con un elemento._
- [x] Posiciones persistentes por proyecto (`Node.position`). Un nodo arrastrado queda fijado (chincheta); «Volver a automática» en el inspector o «Recolocar» en la barra lo sueltan. Las posiciones entran en el historial de deshacer, agrupadas por arrastre.
- [x] Disposiciones automáticas (`layout.ts`, probadas): jerárquica según la estructura elegida (`d3-hierarchy`), de fuerzas (`d3-force`, determinista) y radial alrededor del nodo seleccionado. Solo mueven los nodos no fijados.
- [x] Nodos rediseñados: icono y color del tipo, nombre, tipo, número de relaciones, aviso de ficha incompleta y chincheta. _Sin retrato hasta la Fase 7 (imágenes)._
- [x] Aristas: flechas en dirigidas con el color del tipo, estilos continua/gruesa/discontinua, etiqueta con el nombre propio de la relación, paralelas en abanico, borde a borde y esquivando tarjetas (hasta 200 nodos).
- [x] Crear relación arrastrando desde el asa derecha de un nodo hasta otro: menú con los tipos compatibles.
- [x] Crear nodo raíz con doble clic en el lienzo, en esa posición.
- [x] Resaltado de vecinos al pasar el ratón (sobre el DOM, sin rerender).
- [x] Modo foco a 1, 2 o 3 saltos del nodo seleccionado.
- [x] Filtros y leyenda: mostrar u ocultar cada tipo de entidad y de relación y la jerarquía «Dentro de», con recuentos. _El filtro por etiqueta espera a que existan etiquetas (Fase 3)._
- [ ] Agrupar visualmente los hijos dentro del padre (contenedores plegables): descartado por ahora, las estructuras alternativas lo cubren mejor.
- [x] Rendimiento con 500 nodos y 1500 relaciones (Chromium sin interfaz): carga 1,3 s; arrastre 20 ms por paso; disposición jerárquica 1,3 s y de fuerzas 2,5 s (una vez); resaltado al pasar el ratón 0,22 s. Mejorable, pero usable; en mundos de cientos de nodos es instantáneo.

**Relaciones estructurales (añadido en esta fase a petición del usuario):**

- [x] Un tipo de relación puede marcarse «Forma estructura» e indicar qué extremo es el superior (`Schema.structural`, `Schema.parentEnd`).
- [x] El panel de estructura tiene «Ver por»: Dentro de o cualquier relación estructural (`src/domain/structure.ts`). Un nodo con varios superiores aparece bajo cada uno; los ciclos se cortan.
- [x] «Añadir dentro de» en una estructura relacional crea el nodo y la relación que lo cuelga; los tipos ofrecidos respetan «Desde/Hacia» del tipo de relación.
- [x] La disposición jerárquica del lienzo usa la estructura elegida.
- [x] La vista del mapa (estructura, disposición, filtros, foco) se guarda con el proyecto (`Project.view`) sin pasar por el historial.

Criterio: con el mundo real del libro cargado, se puede localizar un personaje, ver sus conexiones y aislarlas sin perderse.

### Fase 3 — Fichas y navegación

Objetivo: que cada elemento del mundo tenga una ficha rica y se pueda saltar de uno a otro como en una wiki.

- [x] Inspector con pestañas **Ficha**, **Conexiones** y **Notas**, con ruta de superiores y botones atrás/adelante (también Alt+←/→).
- [x] Controles de `nodeRef` / `nodeRefs`: selector con buscador limitado a los tipos permitidos (con herencia) y «Crear nuevo…» que crea el nodo y lo elige.
- [x] **Referencias como vínculos** (decisión tomada con el usuario, ver abajo): se dibujan en el lienzo como líneas punteadas con el nombre del atributo, se apagan en la leyenda, cuentan como conexiones y son estructuras en «Ver por».
- [x] Pestaña Conexiones: superior y subnodos, relaciones agrupadas por tipo con sentido, referencias que hace y que recibe, y menciones en ambos sentidos. Todo navega al nodo o a la relación.
- [x] Notas por nodo con menciones `[[Nombre]]`: modo leer con enlaces (y aviso cuando el nombre no existe), modo editar con botón «Mencionar», y conexiones inversas.
- [x] Imagen o retrato por nodo: hecho como tipo de atributo «Imagen» (reducida a 384 px y guardada con el proyecto); la tarjeta muestra el retrato en lugar del icono del tipo.
- [ ] Etiquetas libres por nodo: pasan a la Fase 4 junto con el resto del modelo.
- [ ] Vista «Ficha completa» a pantalla entera: pospuesta; el inspector ensanchado cubre el uso actual.
- [x] Historial de navegación (atrás / adelante) y migas de pan con la jerarquía.
- [x] **Paleta de comandos** (Ctrl+K): nodos (por nombre, valores y notas), relaciones, tipos y acciones (crear nodo de un tipo, cambiar de vista, tema).
- [x] Búsqueda global: la paleta busca en nombres, valores y notas; el árbol sigue filtrando por nombre y valores.
- [x] Selección sincronizada: elegir en el árbol, en conexiones, en una mención o en la paleta centra el elemento en el lienzo.
- [x] Árbol: arrastrar y soltar para cambiar de padre y reordenar hermanos: hecho el 2026-10-04 (ver «Pendientes señalados por el usuario»).

**Decisión de modelo (2026-10-03):** el usuario preguntó si modelar la pertenencia a una ciudad como relación o como atributo de referencia. Se acordó que ambos existen con una regla: **atributo de referencia** cuando es una propiedad del nodo (ciudad, dios patrón, escuela de magia), y **relación** cuando el vínculo tiene datos propios, es entre iguales o necesita estilo. Para que el atributo valga como vínculo, se dibuja, se lista como conexión y sirve de estructura (`src/domain/references.ts`).

Criterio: desde un personaje se llega a su dios, a su lugar y a su escuela de magia en un clic, y desde cada uno de ellos se ve quién más está conectado.

Notas de cierre (2026-10-03): verificado en Chromium (Playwright) sin errores: editar y crear referencias desde la ficha, conexiones y navegación atrás/adelante, menciones (resueltas y no resueltas), «Ver por Ciudad» con creación dentro de una ciudad, paleta Ctrl+K (saltar y crear) y leyenda de referencias. Corregidos en la fase: el inspector tapaba las pestañas por un `grid` de dos filas; el centrado al navegar se adelantaba al cambio de tamaño del panel.

### Fase 4 — Modelo de datos enriquecido

Objetivo: modelar el mundo con matices sin perder el carácter generalista.

**Adelantado a petición del usuario (2026-10-03):**

- [x] **Biblioteca de atributos compartidos** (`Project.fieldLibrary`, `src/domain/library.ts`): un atributo se define una vez y se vincula a varios tipos conservando el mismo id, así que los valores no cambian al compartir o desvincular. Viven en la vista **Propiedades** (tercera pestaña de la barra, Alt+3), llamadas «preformas»; en cada tipo, «Añadir» ofrece **Definición rápida** (atributo propio) o **Preforma**, las preformas vinculadas se muestran con insignia y se pueden desvincular, y cualquier atributo propio se puede convertir en preforma con un clic. En etiquetas y descripciones, `{tipo}` se sustituye por el nombre del tipo («Nombre del {tipo}» → «Nombre del Personaje»).
- [x] **Tipo de atributo «Imagen»**: la imagen se reduce a 384 px de lado mayor (JPEG) y se guarda en el valor del nodo; se muestra en la tarjeta del lienzo y en la cabecera del inspector en lugar del icono del tipo. Las búsquedas no indexan estos valores. _Límite mientras los datos vivan en `localStorage` (~5 MB en total): unos 20–40 KB por retrato._
- [x] Corrección derivada: `allFields` solo sustituye por clave entre niveles de herencia; dentro de un mismo tipo se conservan todos los atributos aunque repitan clave.

- [x] (hecho en fases anteriores: nombre inverso por tipo y por relación, sentido «Bidireccional», parentesco) Relaciones con **nombre por dirección** ("padre de" / "hijo de", "venera a" / "venerado por") y relaciones **simétricas** ("hermano de", "aliado de").
- [x] (hecho: atributos de relación en el formulario de la ficha) Atributos de relación visibles y editables (intensidad, desde cuándo, si es pública o secreta…).
- [x] (hecho: referencias dibujadas como aristas discontinuas y usables en «Ver por», ocultables en la leyenda) Opción de **dibujar los campos de referencia como aristas** ("Dios: Aurel" se ve en el grafo sin crear además una relación). Decidir y documentar cuándo usar campo de referencia y cuándo relación.
- [x] Nuevos tipos de campo (2026-10-04): Enlace (URL, con botón para abrir), Color (selector y valor hex), Escala 1–5 (estrellas) y Etiquetas (chips libres); Imagen ya estaba. _Pendientes: lista ordenada y fecha del mundo._
- [x] Valores por defecto tipados y heredados (2026-10-04): el valor inicial se edita con el control del tipo (lista, escala, etiquetas, fecha, color, referencia…), lo heredan los subtipos y el editor ofrece «Rellenar N fichas vacías».
- [x] Campos calculados reales (2026-10-04): motor en `src/domain/formulas.ts` con `{clave}`, `{referencia.clave}`, `{titulo}`, `{tipo}`, `{padre}`, `{padre.clave}`, `{contar(relaciones[:Tipo])}`, `{contar(hijos)}`, `{contar(clave)}`, `{lista(relaciones[:Tipo])}` y `{lista(hijos)}`; calculados anidados con límite de profundidad; ayuda en el editor de atributos.
- [x] Validación de campos obligatorios con avisos no bloqueantes y contador de "fichas incompletas" (2026-10-04: marca en la tarjeta y lista con detalle en la vista «Salud»).
- [x] Restricciones de cardinalidad en relaciones (2026-10-04): `Schema.maxPerSource` y `maxPerTarget` (sin sentido: un máximo por nodo) editables en el tipo; `src/domain/cardinality.ts` lista los límites superados y avisa antes de crear; aviso en la ficha (pestaña de relaciones) y toast al crear desde el lienzo, la ficha o la matriz. No se impide crear la relación.
- [x] Barra superior en dos grupos, «Datos» y «Esquema» (2026-10-04); arrastre con previsualización en vivo (fantasma) para tipos, atributos y preformas; mensaje de atributo desactivado por herencia (se puede conservar).
- [x] Herencia de atributos afinada (2026-10-04): duplicados y conflictos de clave con lo heredado señalados en la tarjeta de atributos (quitar el duplicado o elegir cuál prevalece); al borrar un tipo con subtipos, estos conservan sus atributos como preformas y los valores no se pierden; lista de tipos como árbol de herencia y reordenable arrastrando.
- [x] Herencia de subnodos permitidos y de restricciones de relación (2026-10-04): un tipo admite como subnodos los suyos más los de sus ancestros; una relación hereda «Desde»/«Hacia» del ancestro más cercano cuando los deja vacíos. El editor lo indica. Etiquetas «Datos/Esquema/Disposición» más discretas y separador centrado con el color del borde.
- [x] Cambiar de proyecto reinicia el estado local de las vistas y la selección (2026-10-04): la tabla ya no se queda en blanco con el tipo del proyecto anterior.
- [x] Las disposiciones solo cuentan los nodos visibles (2026-10-04): ocultar un tipo o cambiar el foco redistribuye el resto; los ocultos no dejan huecos.
- [x] Jerárquica con satélites (2026-10-04): las raíces sin subnodos pero con vínculos (piezas montadas por varios modelos) se colocan junto a sus vecinos en vez de en la columna de raíces; interruptor «Sueltos junto a sus vínculos» en la leyenda.
- [x] Duplicar nodos (2026-10-04) desde la ficha (menú «Duplicar»: solo ficha o con relaciones), con Ctrl+D en el mapa y desde la tabla; el título lleva «(copia)» y las posiciones fijadas se desplazan. Duplicar tipos desde el editor (atributos con ids nuevos, preformas vinculadas, apariencia y restricciones; sin nodos).
- [x] Operaciones masivas (2026-10-04): en la Tabla, casillas por fila y barra con «Cambiar tipo», «Mover a», «Etiquetar» y «Eliminar», todo deshacible.
- [x] (2026-10-04: `src/domain/templates/`, diálogo «Ejemplos y plantillas» desde el menú del proyecto y la ayuda; «Añadir sus tipos» a un proyecto existente) **Plantillas de proyecto**: "Mundo de fantasía" (Personaje, Raza, Lugar, Reino, Deidad, Escuela de magia, Facción, Objeto, Acontecimiento; relaciones de familia, lealtad, enemistad, culto, pertenencia, práctica de magia), "Novela" (añade Capítulo y Escena con apariciones), "Vacío". Tipos y campos de una plantilla se pueden importar a un proyecto existente.

Criterio: el mundo del libro se puede modelar sin trucos ni duplicaciones, y la plantilla de fantasía permite empezar un mundo nuevo en minutos.

### Fase 5 — Vistas alternativas y lentes

Objetivo: mirar el mismo mundo desde ángulos distintos.

- [x] **Vistas guardadas** (`Project.lenses`): nombre + configuración del mapa (estructura, disposición, foco, etiquetas, tipos ocultos) y, opcionalmente, las posiciones fijadas. Menú «Vista» en la barra del lienzo: aplicar, guardar la actual, actualizar, renombrar, eliminar. Cualquier cambio manual desliga la vista activa (`view.lensId`). Aplicar una vista no entra en el historial; guardar, renombrar y borrar sí.
- [x] **Tabla** por tipo (2026-10-04): vista «Tabla» (Alt+5) con una hoja por tipo de entidad (incluye subtipos): fila por nodo, columna por atributo editable en la celda (texto, número, fecha, lista, sí/no, género, referencias; imagen como miniatura; calculados en solo lectura), más «Dentro de» y número de relaciones; filtro por texto, orden por columna, columnas ocultables (recordado por proyecto y tipo), nuevo nodo con foco en el título, eliminar con confirmación y abrir en el mapa.
- [x] **Matriz de relaciones** (2026-10-04): en la vista Tabla, entrada «Matriz de relaciones»: tipo en filas × tipo en columnas, filtro por tipo de relación, un punto por relación con el color de su tipo, calor por nº de relaciones, totales por fila y columna, «Ocultar vacíos» y «Ordenar por nº»; pulsar una celda lista sus relaciones (abrir en el mapa) y permite crear una nueva entre ese par; opciones recordadas por proyecto.
- [x] **Genealogía**: disposición «Genealogía» (árbol vertical, una generación por fila) sobre la estructura elegida en «Ver por». Sustituido a petición del usuario por **relaciones genealógicas** (`Schema.genealogical`): sus relaciones eligen un término del **vocabulario de parentesco** del proyecto (`Project.kinship`, `src/domain/kinship.ts`: nombre neutro/masculino/femenino, contraparte, generación, ascendencia directa) en lugar de un nombre libre; editable en el tipo de relación. El papel de cada extremo se calcula con el término y el género del nodo (nuevo tipo de atributo **Género**), con contraparte para el destino y opción «usar nombre neutro». Al crear una relación genealógica se ofrece añadir «Género» a los tipos que no lo tienen. Solo la ascendencia directa forma el árbol («Ver por» y Genealogía). Se retiró el selector «Clase» de los tipos.
- [x] Escala del mapa (2026-10-04): control ×0,5–×8 que agranda la imagen en el lienzo manteniendo el tamaño de los nodos (los colocados se reubican en proporción); al alejar el zoom los marcadores que se amontonan se funden en un punto con su número, de tamaño constante en pantalla; al pasar el ratón lista los nombres (clic para ir al nodo) y clic en el punto acerca.
- [x] Marcadores compactos sobre el mapa (2026-10-04): los nodos colocados sobre la imagen son círculos con su icono o retrato; al pasar el ratón se expanden con animación a la tarjeta completa y los marcadores que taparía se apartan y vuelven; los de la bandeja siguen siendo tarjetas. La imagen queda bajo nodos y aristas también mientras se arrastra uno desde la bandeja.
- [x] **Mapa** (2026-10-04): disposición «Mapa» con imagen de fondo del proyecto (hasta 2400 px, guardada con el proyecto); los nodos se colocan arrastrándolos sobre ella (posición fijada propia de esta disposición) y los no colocados esperan en una bandeja debajo; «Subir / Cambiar / Quitar imagen» en la barra; exportable a PNG/SVG; la leyenda recuerda qué tipos mostrar aquí.
- [ ] **Línea temporal**: acontecimientos y nodos con fechas, con calendario del mundo configurable (eras, años, meses propios) además del calendario real.
- [x] «Dentro de» solo si no hay otra relación (opción en la leyenda, activada por defecto): si entre padre e hijo ya hay una relación o referencia visible, no se dibuja la línea de jerarquía.
- [x] Aristas con menos entropía (2026-10-04): rutas por laterales enfrentados (lateral si el otro nodo queda a un lado; arriba/abajo si queda encima o debajo) en curva S; las líneas que comparten lado se reparten ordenadas por la posición del otro extremo, sin cruzarse al salir; la curva clásica con esquivado solo cuando la S atravesaría una tarjeta o las tarjetas se solapan en el eje dominante.
- [x] Exportar el mapa a PNG / SVG (2026-10-04): menú «Exportar imagen» en la barra del lienzo; todo el mapa (encuadre automático, PNG a doble resolución) o la vista actual; respeta tema, disposición, filtros y conectores.

Criterio: las preguntas del objetivo se responden cada una con la vista más adecuada, no forzando el grafo.

### Fase 6 — Análisis del mundo

Objetivo: que la herramienta ayude a detectar huecos, redundancias y puntos clave, que es el propósito original del producto.

- [x] Panel **Salud del mundo** (2026-10-04): vista «Salud» (Alt+6, también en la paleta) con nodos sin conexiones, fichas incompletas (obligatorios vacíos, con el detalle), tipos sin instancias, límites de relación superados, referencias rotas (nodo inexistente o de tipo no admitido) y menciones `[[ ]]` sin destino; cada aviso salta al nodo o al tipo. Dominio en `src/domain/health.ts` (`worldHealth`), que también aporta `isIncomplete` al lienzo.
- [x] **Centralidad** (2026-10-04): `src/domain/centrality.ts` (grado, intermediación de Brandes y puentes de Tarjan sobre relaciones, jerarquía y referencias). La vista «Salud» muestra «Estructura del grafo»: los más centrales (con conexiones e intermediación) y los puentes (nodos y vínculos). Botón «Tamaño por centralidad» en el lienzo (`view.sizeByCentrality`, se guarda con el proyecto): las tarjetas se escalan entre 0,85 y 1,25 según su intermediación sobre los vínculos visibles.
- [x] **Comunidades** (2026-10-04): `src/domain/communities.ts` (Louvain determinista con agregación por niveles, sobre vínculos sin peso). Tarjeta «Comunidades» en «Salud» (color, tamaño y miembros más conectados) y botón «Color por comunidad» en el lienzo (`view.colorByCommunity`, se guarda con el proyecto): las tarjetas toman el color de su comunidad sobre los vínculos visibles.
- [x] **Camino entre dos nodos** (2026-10-04): botón «Camino entre dos nodos» en la barra del lienzo abre un panel con dos selectores (el origen parte del nodo seleccionado); `shortestPath` (`src/domain/paths.ts`) busca por los vínculos visibles (relaciones, jerarquía y referencias, sin sentido), el lienzo atenúa todo lo que no es el camino y el panel lista los pasos (clic para seleccionar). El filtro de tipos es el de la leyenda: lo oculto no cuenta.
- [x] **Posibles redundancias** (2026-10-04): `src/domain/redundancy.ts` compara parejas del mismo tipo por atributos con valor (sin título ni imagen; sin distinguir mayúsculas) y vecinos (relaciones, jerarquía y referencias, sin contar el vínculo entre ambos); con al menos 3 señales y coincidencia ≥ 75 % entra en la tarjeta «Posibles redundancias» de «Salud», con el detalle de en qué coinciden y difieren.
- [x] **Consultas guardadas** (2026-10-04): `Project.queries` (`src/domain/queries.ts`: tipo con subtipos y condiciones «todas» sobre atributos (vacío, con valor, es, no es, contiene, mayor, menor; referencias por título, sí/no, listas), relaciones (con/sin, por tipo y extremo), nodo superior y subnodos). Constructor visual en «Salud» (`QueryDialog`) con vista previa; cada consulta guardada es una tarjeta con sus resultados, editable y borrable (deshacible). Acciones `save-query`/`delete-query`.
- [x] Estadísticas por tipo (2026-10-04): `src/domain/stats.ts` (`typeStats`): nodos por tipo, relaciones por nodo de media y sin ninguna, y distribución de valores de listas, etiquetas, sí/no, género y escala (con los sin valor). Bloque «Estadísticas por tipo» en «Salud» con barras por tipo.

Criterio: el panel señala correctamente los huecos de un proyecto de prueba con problemas conocidos, y las métricas están cubiertas por pruebas.

### Fase 7 — Persistencia, copias y exportación

Objetivo: que los datos estén a salvo y se puedan llevar a otras herramientas.

- [ ] Migrar a IndexedDB conservando la lectura de `nodaria_state_v1`.
- [ ] Almacenamiento de imágenes (retratos, mapas) con redimensionado al subirlas.
- [ ] Copias automáticas periódicas y restauración desde una lista de instantáneas.
- [ ] Guardar en un archivo o carpeta del disco con la File System Access API (permite usar Dropbox/Drive/Git como sincronización sin servidor).
- [ ] Exportar a Markdown compatible con Obsidian (una nota por nodo, enlaces `[[ ]]`), a CSV por tipo y a un ZIP con imágenes.
- [ ] Importar desde CSV (crear muchos personajes de golpe).
- [ ] Importación con vista previa y opción de fusionar en el proyecto actual.
- [ ] PWA instalable y con funcionamiento sin conexión.

Criterio: se puede cerrar el navegador, cambiar de equipo y recuperar el mundo completo, imágenes incluidas.

### Fase 8 — Asistente IA (opcional)

Objetivo: un segundo lector del mundo, nunca imprescindible.

- [ ] Configuración con clave de API propia guardada solo en local; aviso claro de qué datos se envían.
- [ ] Preguntas en lenguaje natural sobre el mundo ("¿quién podría traicionar a X?", "¿qué personajes no tienen motivación clara?").
- [ ] Sugerencias de relaciones o atributos que faltan, siempre como propuestas que el usuario acepta o descarta.
- [ ] Detección de incoherencias entre notas y datos estructurados.
- [ ] Generar resúmenes de un nodo, de un grupo o de una lente.

Criterio: todas las funciones son opcionales, desactivables y no modifican datos sin confirmación.

### Pendientes señalados por el usuario (2026-10-03, tercera ronda)

- [x] Árbol de estructura (2026-10-04): arrastrar y soltar para anidar un nodo en otro (zona central de la fila), colocarlo antes o después de un hermano (bordes de la fila) o sacarlo a la raíz (zona libre del árbol). Funciona en cualquier estructura de «Ver por»: jerarquía, relaciones estructurales, parentesco y atributos de referencia; respeta tipos admitidos y evita ciclos (destino inválido en rojo). Deshacible.
- [x] Etiquetas de aristas hermanas (mismo origen, destinos a distancia parecida) repartidas a lo largo de la línea para no pisarse.
- [x] Fuerzas: radio de colisión acorde al ancho de la tarjeta, cascada por profundidad en la estructura (generales arriba) y agrupación horizontal por tipo.
- [x] El lienzo recalcula la disposición al cambiar el tipo o el parentesco de una relación (antes solo al añadir o quitar nodos o relaciones).
- [x] Vocabulario de parentesco: término nuevo vacío y enfocado; contraparte con sus formas; explicación de «Árbol».
- [x] Imágenes de atributo (2026-10-04): forma (circular, cuadrada, redondeada), borde opcional, «Retrato del nodo» explícito (en tarjeta, árbol, listas y ficha) y miniaturas de las demás imágenes en la tarjeta según «Mostrar en el nodo»; miniaturas con forma en la Tabla y en el control de la ficha.
- [x] Mapa (2026-10-04): bandeja lateral «Sin colocar» inmune al zoom con arrastre al mapa; marcadores de tamaño constante en pantalla; contador de grupos centrado; botón de imagen y exportar en el lienzo (arriba a la izquierda) y escala sobre el minimapa. Logo propio y favicon; catálogo de iconos ampliado (~230).
- [x] Fuerzas (2026-10-04): corregida la mezcla de grupos. Cada nodo suelto en la estructura (sin superior ni subordinados) se ancla al vecino vinculado que forme parte de la estructura o, si no hay, al más conectado; la semilla es el bosque de anclas colocado con un árbol de anchuras reales, y una fuerza de agrupación mantiene cada nodo bajo su ancla conservando el desplazamiento horizontal de la semilla (los grupos anchos no invaden a los vecinos). El vínculo entre un nodo y su ancla apenas tira; la columna por tipo solo rige para los nodos sin ancla. Regla genérica, sin depender de tipos concretos. Prueba en `forceGrouping.test.ts`. Corrección posterior el mismo día: «estructural» se fija solo con la jerarquía antes de anclar por vínculos y se impiden cadenas circulares de anclas (un ciclo hacía que el grupo se desplazara sin límite); el muelle de agrupación actúa en los dos sentidos.
- [x] Fuerzas: respetan los nodos fijados con chincheta (entran como obstáculos inmóviles) y el resto se acomoda sin pisarlos.
- [x] Genealogía (2026-10-04): disposición propia con parejas juntas (término «Pareja» o progenitores con hijos comunes), hijos centrados bajo sus padres, hermanos contiguos y líneas rectas para la ascendencia.
- [x] Chincheta por disposición (2026-10-04): las posiciones fijadas pertenecen a la disposición en la que se arrastró el nodo (formato de proyecto v4, `Node.positions[layout]`); la chincheta se dibuja en color de acento.
- [x] Conectores de familia en Genealogía (2026-10-04): barra entre la pareja, bajada única, bus horizontal y bajadas en ángulo recto con esquinas redondeadas a cada hijo; sustituyen a las flechas de progenitor y cónyuge en esa disposición.
- [x] Parentesco deducido (2026-10-04): abuelos, nietos, hermanos, tíos, sobrinos y primos se deducen de la ascendencia directa; se listan en la ficha («Deducido por el árbol») y en Genealogía las relaciones explícitas que ya se deducen no se dibujan.
- [x] Genealogía: todo el parentesco va en trazos ortogonales (puente por encima entre parientes de la misma fila; bajada, tramo horizontal y bajada entre filas), con etiqueta y clic para seleccionar; filas más separadas; generaciones fieles a la ascendencia (camino más largo) aunque otra relación contradiga.
- [x] Formulario de relación: en parentesco el término siempre describe a este nodo («Grugnak es…»), sin selector de sentido; el editor se desplaza a la vista al abrirse.
- [x] Parentesco en conflicto (2026-10-04): las relaciones cuyo salto de generación no cuadra con el árbol se marcan en la ficha (aviso con explicación) y en el lienzo (trazo en color de aviso); botón «Invertir» en cada relación de parentesco.
- [x] Columna «Deducción» en el vocabulario (2026-10-04): cada término declara qué papel deducible representa (abuelo, nieto, hermano, tío, sobrino, primo); nada queda atado a identificadores del vocabulario inicial. Botón «Establecer» en los parentescos deducidos.
- [x] Sospechosas al revés: la relación de ascendencia que, invertida, hace cuadrar al resto se marca en rojo con su explicación y «Invertir» destacado; las fichas afectadas señalan la causa.
- [x] Relaciones genealógicas ocultas por defecto fuera de Genealogía (una sola vez por tipo y proyecto; si el usuario las muestra, se respeta).
- [x] Cada disposición recuerda sus propios filtros (entidades y relaciones ocultas) y si la leyenda está abierta, por proyecto (preferencias del navegador), también al recargar.
- [x] Corrección (2026-10-04): los filtros por disposición pasan al proyecto (`view.layoutFilters`) e incluyen las referencias ocultas, que antes se compartían entre disposiciones; en el navegador solo queda si la leyenda está abierta. Comprobado en Chromium que Jerárquica y Fuerzas conservan filtros distintos.
- [x] Guía de fórmulas en la ayuda («?» → pestaña Fórmulas) con todas las expresiones, buenas prácticas y ejemplos; enlace desde el editor de atributos. Genealogía solo está disponible con un tipo de relación genealógico y, sin recuerdo previo, oculta los tipos que ningún parentesco admite y abre la leyenda.
- [x] Atributo de sistema «Género»: fila bloqueada con candado y explicación (no se edita, solo se reordena o se quita); puede elegirse a mano como tipo y entonces toma nombre y clave fijos.
- [x] «Mostrar en el nodo» con tres modos (No, Solo icono, Icono y texto) por atributo y por opción de lista; «Icono y texto» añade líneas bajo el nombre y la tarjeta crece en altura; las disposiciones y los conectores usan la altura real.
- [x] Iconos de atributos (2026-10-04): cada atributo puede llevar un icono del catálogo y cada opción de una lista el suyo; «Mostrar en el nodo» enseña en la tarjeta el icono de la opción elegida (o el del atributo cuando tiene valor), y la ficha lo muestra junto al nombre.
- [x] Chincheta de cómic clavada en la esquina de la tarjeta. Mantenerla pulsada segundo y medio la arranca (se tambalea y sale), el nodo vuelve a su sitio automático y la chincheta cae por el lienzo, rebota en el suelo, queda tumbada y se desvanece.
- [x] Valor inicial de «Lista de opciones» elegido entre sus opciones (y «Sí/No» para booleanos); un valor fuera de la lista se ignora.
- [x] Barra del lienzo: etiquetas «Disposición» y «Foco» dentro de su grupo, opción elegida en color de acento, menú «Vistas» con flecha.
- [x] Genealogía: usa siempre la estructura de parentesco (aunque «Ver por» sea otra); hermanos y demás parientes sin ascendencia registrada se colocan en la fila de su generación; lugares y otros nodos sin parentesco en una fila aparte.

### Fase 9 — Tutorial y primeros pasos

Objetivo: que alguien que llega a https://nodaria.yosiftware.es sin contexto entienda en cinco minutos qué es y cómo empezar.

- [x] Mensaje de bienvenida que explique el flujo (tipos → relaciones → nodos) y enlace a los atajos. _Primera versión hecha el 2026-10-03; diálogo de bienvenida con cuatro caminos el 2026-10-04._
- [x] **Proyectos de ejemplo** (2026-10-04) cargables desde la bienvenida, el menú de proyecto y la ayuda: «Coches» (básico, base del recorrido) y «Caso Puerto Norte» (complejo, no fantástico: herencia en tres niveles, preformas, familias con género, referencias, pagos, vistas guardadas, consultas y notas con menciones). Cada apertura crea una copia propia del usuario, editable y reutilizable.
- [x] **Recorrido guiado** (2026-10-04): diez pasos sobre «Ejemplo: Coches» (proyecto, barra, estructura, lienzo, ficha, disposiciones, tipos, relaciones, tabla, salud); Escape lo cierra, flechas navegan; se relanza desde la ayuda.
- [x] (2026-10-04, en la pestaña «Primeros pasos» de la ayuda) Ayuda contextual en los puntos difíciles: qué es una estructura, cuándo usar atributo de referencia o relación, qué es una preforma, cómo funciona el parentesco con género.
- [x] Página de ayuda («?») ampliada (2026-10-04): pestaña «Primeros pasos» con el flujo y los conceptos clave, además de atajos y fórmulas.
- [ ] Textos vacíos de cada vista (Tipos, Relaciones, Propiedades) con el siguiente paso sugerido.

Criterio: una persona nueva crea un tipo, dos nodos y una relación sin ayuda externa; el proyecto de ejemplo muestra todas las funciones principales.

## Orden recomendado y primer hito

1. **Fase 0** completa (urgente: B1 y B2 pueden dejar la app inutilizable con los datos guardados).
2. **Fase 1** hasta los componentes comunes y el tema; el resto puede ir en paralelo con las siguientes.
3. **Fase 3** (controles de referencia y pestaña Conexiones) **antes** que la Fase 2: es lo que más se nota al escribir y no depende del lienzo nuevo.
4. **Fase 2** (lienzo).
5. **Fase 4 → Fase 6 → Fase 5 → Fase 7 → Fase 8**, ajustando según el uso real.

**Primer hito útil** ("se puede trabajar el libro"): Fase 0 + componentes comunes de la Fase 1 + controles `nodeRef`, pestaña Conexiones y paleta de comandos de la Fase 3.

## Estado

| Fase                           | Estado                  |
| ------------------------------ | ----------------------- |
| 0 — Estabilidad e integridad   | Completada (2026-10-03) |
| 1 — Sistema de diseño          | Pendiente               |
| 2 — Lienzo de grafo            | Completada (2026-10-03) |
| 3 — Fichas y navegación        | Pendiente               |
| 4 — Modelo enriquecido         | Completada (2026-10-04) |
| 5 — Vistas y lentes            | Pendiente               |
| 6 — Análisis                   | Pendiente               |
| 7 — Persistencia y exportación | Pendiente               |
| 8 — Asistente IA               | Pendiente               |
| 9 — Tutorial y primeros pasos  | Pendiente               |

## Criterios de finalización del roadmap

- Las fases 0 a 7 están completadas o descartadas de forma explícita y documentada.
- El mundo real del libro está modelado en Nodaria y las preguntas del apartado "Objetivo" se responden desde la propia app.
- Las reglas de dominio tienen pruebas automatizadas y `npm run lint`, `npm run build` y `npm test` pasan.
- `PROJECT_CONTEXT.md` refleja la arquitectura, el modelo y las dependencias resultantes.
- Los proyectos creados antes del roadmap se abren sin pérdida de datos.
