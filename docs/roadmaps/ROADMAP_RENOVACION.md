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

Excluido (por ahora): servidor propio, cuentas de usuario, colaboración en tiempo real, sincronización en la nube gestionada por Nodaria, aplicación móvil nativa.

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

- [ ] Inspector rediseñado con pestañas: **Ficha** (atributos), **Conexiones**, **Notas**.
- [ ] Controles de `nodeRef` / `nodeRefs`: buscador con autocompletado filtrado por los tipos permitidos, chips clicables que navegan al nodo y opción "crear nuevo" desde el propio selector.
- [ ] Pestaña **Conexiones**: relaciones salientes y entrantes agrupadas por tipo, referencias desde campos de otros nodos (_backlinks_), hijos y padre. Todo clicable.
- [ ] Notas en Markdown con menciones `[[Nombre]]` o `@Nombre` que se convierten en enlaces navegables y se listan como _backlinks_ en el nodo mencionado.
- [ ] Imagen o retrato por nodo (requiere la persistencia de la Fase 7; mientras tanto, solo color e icono).
- [ ] Etiquetas libres por nodo, filtrables en toda la app.
- [ ] Vista **Ficha completa** a pantalla entera, legible como una página de enciclopedia del mundo.
- [ ] Historial de navegación (atrás / adelante) y migas de pan con la jerarquía.
- [ ] **Paleta de comandos** (Ctrl+K): buscar cualquier nodo, tipo o acción y saltar a él.
- [ ] Búsqueda global que incluya notas y valores de atributos, con resultados resaltados.
- [ ] Selección sincronizada entre árbol, lienzo e inspector (seleccionar en uno centra en los demás).
- [ ] Árbol: arrastrar y soltar para cambiar de padre (respetando las reglas), reordenar hermanos, mostrar el contexto de los resultados de búsqueda.

Criterio: desde un personaje se llega a su dios, a su lugar y a su escuela de magia en un clic, y desde cada uno de ellos se ve quién más está conectado.

### Fase 4 — Modelo de datos enriquecido

Objetivo: modelar el mundo con matices sin perder el carácter generalista.

- [ ] Relaciones con **nombre por dirección** ("padre de" / "hijo de", "venera a" / "venerado por") y relaciones **simétricas** ("hermano de", "aliado de").
- [ ] Atributos de relación visibles y editables (intensidad, desde cuándo, si es pública o secreta…).
- [ ] Opción de **dibujar los campos de referencia como aristas** ("Dios: Aurel" se ve en el grafo sin crear además una relación). Decidir y documentar cuándo usar campo de referencia y cuándo relación.
- [ ] Nuevos tipos de campo: imagen, URL, color, escala (1–5), etiquetas, lista ordenada, fecha del mundo (ver Fase 5).
- [ ] Valores por defecto tipados y heredados.
- [ ] Campos calculados reales (valor visible; funciones simples: contar relaciones, concatenar, referencia a un campo de otro nodo).
- [ ] Validación de campos obligatorios con avisos no bloqueantes y contador de "fichas incompletas".
- [ ] Restricciones de cardinalidad en relaciones (p. ej. "un personaje tiene como máximo un dios patrón") y aviso al violarlas.
- [ ] Herencia de subnodos permitidos y de restricciones de relación.
- [ ] Duplicar nodos (con o sin sus relaciones) y tipos.
- [ ] Operaciones masivas: cambiar tipo, mover, etiquetar o borrar varios nodos a la vez.
- [ ] **Plantillas de proyecto**: "Mundo de fantasía" (Personaje, Raza, Lugar, Reino, Deidad, Escuela de magia, Facción, Objeto, Acontecimiento; relaciones de familia, lealtad, enemistad, culto, pertenencia, práctica de magia), "Novela" (añade Capítulo y Escena con apariciones), "Vacío". Tipos y campos de una plantilla se pueden importar a un proyecto existente.

Criterio: el mundo del libro se puede modelar sin trucos ni duplicaciones, y la plantilla de fantasía permite empezar un mundo nuevo en minutos.

### Fase 5 — Vistas alternativas y lentes

Objetivo: mirar el mismo mundo desde ángulos distintos.

- [ ] **Vistas guardadas (lentes)**: combinación con nombre de filtros, disposición, posiciones y nodos visibles ("Panteón", "Genealogía de la casa X", "Geopolítica"). Cambiar de lente desde la barra superior.
- [ ] **Tabla** por tipo: hoja de cálculo editable, columnas configurables, orden y filtros, edición rápida de muchas fichas.
- [ ] **Matriz de relaciones**: tipo A × tipo B (p. ej. personaje × personaje), celdas con el tipo de relación; deja a la vista huecos y concentraciones.
- [ ] **Genealogía**: árbol familiar a partir de los tipos de relación marcados como parentesco.
- [ ] **Mapa**: subir una imagen del mapa del mundo y colocar sobre ella los nodos de tipo lugar (y ver quién pertenece a cada uno).
- [ ] **Línea temporal**: acontecimientos y nodos con fechas, con calendario del mundo configurable (eras, años, meses propios) además del calendario real.
- [ ] Exportar cualquier vista a PNG / SVG.

Criterio: las preguntas del objetivo se responden cada una con la vista más adecuada, no forzando el grafo.

### Fase 6 — Análisis del mundo

Objetivo: que la herramienta ayude a detectar huecos, redundancias y puntos clave, que es el propósito original del producto.

- [ ] Panel **Salud del mundo**: nodos sin relaciones, fichas incompletas, tipos sin instancias, relaciones que violan restricciones, referencias rotas.
- [ ] **Centralidad**: nodos más conectados y "puentes" que unen grupos que de otro modo estarían separados; opción de dimensionar los nodos del lienzo por centralidad.
- [ ] **Comunidades**: detección de grupos (p. ej. Louvain) coloreables en el lienzo.
- [ ] **Camino entre dos nodos**: "¿cómo se conecta A con B?", resaltado en el lienzo, con filtro de tipos de relación.
- [ ] **Posibles redundancias**: nodos del mismo tipo con atributos y conexiones muy parecidos.
- [ ] **Consultas guardadas** con un constructor visual ("Personajes sin dios patrón", "Magos que no pertenecen a ninguna escuela").
- [ ] Estadísticas por tipo: cuántos, cuántas relaciones de media, distribución de valores de un campo de lista.

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
| 4 — Modelo enriquecido         | Pendiente               |
| 5 — Vistas y lentes            | Pendiente               |
| 6 — Análisis                   | Pendiente               |
| 7 — Persistencia y exportación | Pendiente               |
| 8 — Asistente IA               | Pendiente               |

## Criterios de finalización del roadmap

- Las fases 0 a 7 están completadas o descartadas de forma explícita y documentada.
- El mundo real del libro está modelado en Nodaria y las preguntas del apartado "Objetivo" se responden desde la propia app.
- Las reglas de dominio tienen pruebas automatizadas y `npm run lint`, `npm run build` y `npm test` pasan.
- `PROJECT_CONTEXT.md` refleja la arquitectura, el modelo y las dependencias resultantes.
- Los proyectos creados antes del roadmap se abren sin pérdida de datos.
