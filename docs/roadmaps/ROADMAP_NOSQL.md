# Bases de datos no relacionales

Fecha: 2026-10-22. Estado: **fases 1 a 3 implementadas y publicadas el 2026-10-22** (ver «Implementado» al final). No es el roadmap activo principal (lo es [`ROADMAP_CALENDARIO.md`](ROADMAP_CALENDARIO.md), a falta del piloto). Propuesta para que el propietario decida; las decisiones marcadas como «propuesta» esperan su confirmación (ver «Preguntas abiertas»).

## Objetivo

El propietario pregunta si Nodaria puede ayudar a diseñar bases de datos no relacionales igual que hoy ayuda con las de SQL Server ([`ROADMAP_DIAGRAMAS_BD.md`](ROADMAP_DIAGRAMAS_BD.md)), aunque parezcan lo contrario de un mapa de relaciones.

## Por qué sí encaja

«No relacional» no quiere decir sin relaciones: quiere decir que no se guardan en tablas unidas por claves. Cada familia encaja de una forma distinta en un mapa de nodos:

| Familia | Ejemplos | Cómo se ve en Nodaria | Encaje |
| --- | --- | --- | --- |
| Documentos | MongoDB, Firestore, CouchDB | Una colección es un tipo; lo que va **dentro** del documento (subdocumentos, listas de subdocumentos) es la jerarquía «Dentro de», y lo que se guarda aparte y se apunta con un id es una referencia. El árbol del mapa **es** la forma del documento. | Muy bueno: es el caso principal. |
| Grafos | Neo4j, Amazon Neptune | Es exactamente el modelo de Nodaria: tipos de entidad = etiquetas, tipos de relación = tipos de relación, atributos = propiedades. | Perfecto y barato: casi solo exportar. |
| Clave-valor y columnas anchas | Redis, DynamoDB, Cassandra | Se diseñan a partir de las consultas (patrones de clave, tabla única), no de las entidades. Un mapa ayuda poco. | Malo: fuera de alcance al principio. |

La decisión de diseño que un mapa ayuda a ver en una base de documentos es justo la que más cuesta: **qué se incrusta y qué se referencia**. En el mapa, incrustar es colgar un nodo dentro de otro y referenciar es una línea entre colecciones; se ve de un vistazo qué documentos crecen sin límite o se repiten.

## Propuesta de modelo

Reutiliza lo de SQL en lugar de crear un editor aparte, como se decidió para las tablas el 2026-10-15.

- **Colección** (propuesta): un check heredable en el tipo, «Colección de documentos», al lado de «Tabla de base de datos» y excluyente con él (`Schema.collection`). Un nodo de ese tipo es la definición de una colección; su título, el nombre.
- **Subdocumento** (propuesta): un tipo marcado «Se incrusta» (`Schema.embedded`) que solo vive dentro de otro. Se coloca con la jerarquía de siempre: si «Cliente» admite como subnodo a «Dirección», un nodo Dirección dentro del nodo Cliente es un subdocumento de Cliente. «Uno o lista» se decide por cada hijo (una dirección o una lista de direcciones).
- **Campos**: los atributos, como las columnas de una tabla, con metadatos de documento opcionales (`FieldDefinition.doc`): tipo BSON (deducido si falta, como el SQL), obligatorio, único e índice. Una lista de opciones da un `enum`; una referencia a otra colección es un `ObjectId` (o el id del documento en Firestore); una referencia múltiple es una **lista de ids**, sin tabla intermedia.
- **Colección dentro de colección** (Firestore): un tipo colección colgado de otro es una subcolección.
- **Grafo**: sin modelo nuevo; solo exportar.

## Fases

### Fase 1 — Documentos en el mapa

- [ ] Checks «Colección de documentos» y «Se incrusta» en el editor del tipo, heredables, con su migración (formato 9) y pruebas.
- [ ] Tarjeta «Campos del documento» en el tipo (como «Columnas SQL»): tipo BSON, obligatorio, único, índice, uno o lista en los subdocumentos.
- [ ] Disposición «Documentos» en el mapa: cada colección como una tarjeta con su documento desplegado por niveles (los subdocumentos dentro, sangrados) y las referencias como líneas hasta la colección destino.

### Fase 2 — Revisión y exportación

- [ ] Salud: avisos propios de documentos: listas incrustadas que pueden crecer sin límite (MongoDB corta en 16 MB por documento), niveles demasiado hondos, el mismo subdocumento incrustado en muchas colecciones (posible duplicado de datos), referencias a algo que no es una colección y campos repetidos.
- [ ] Exportar para MongoDB: un script con `db.createCollection(…, { validator: { $jsonSchema: … } })` por colección y sus `createIndex`. Probarlo contra un MongoDB local desechable, como se hizo con SQL Server.
- [ ] Exportar el JSON Schema de cada colección (sirve para otras herramientas y validadores).

### Fase 3 — Grafos

- [ ] Exportar a Neo4j: un script Cypher con las restricciones (únicos por etiqueta) y, opcionalmente, los nodos y relaciones del proyecto con sus propiedades.

### Opcional, más adelante

- Firestore: subcolecciones y un esqueleto de reglas de seguridad.
- Pasar un diseño de tablas a documentos (sugerir qué incrustar según las claves foráneas) y al revés.
- Importar el esquema de una base existente (leer una muestra de documentos y deducir la forma).
- La IA del asistente para proponer colecciones, como ya hace con tablas.

## Preguntas abiertas

1. ¿Qué bases usas o quieres diseñar? (Propuesta: MongoDB primero; dime si es Firestore, porque cambia la exportación.)
2. ¿Te vale incrustar con la jerarquía «Dentro de» (colgar un nodo dentro de otro)? Es lo más «mapa mental»; la alternativa es un atributo de tipo «objeto» con campos anidados dentro de la ficha, que se ve peor en el mapa.
3. ¿Un mismo proyecto puede mezclar tablas y colecciones (por ejemplo, SQL Server para pedidos y MongoDB para el catálogo)? (Propuesta: sí; cada tipo elige.)
4. ¿Hacemos la exportación a Neo4j aunque no la uses ahora? Es la más barata y la que mejor encaja.
5. ¿Clave-valor (Redis, DynamoDB) fuera por ahora? (Recomendado: sí.)

## Criterios de finalización

- Se modela en el mapa una base de documentos real (incrustado frente a referencia), se revisa en Salud y se exporta un script que crea las colecciones con su validación en el motor elegido, probado contra una instancia desechable.
- Lint, build y pruebas correctos; flujos comprobados en Edge; `PROJECT_CONTEXT.md` y la ayuda actualizados.

## Implementado (2026-10-22)

Respuestas del propietario: MongoDB y Firestore, y Neo4j porque es barato; mezclar motores en un proyecto y relacionarlos entre sí, con una disposición «Base de datos» común; cómo incrustar, a mi criterio.

**Decisiones tomadas:**
- **Motor por tipo, heredable** (`Schema.dbEngine`, formato 9): el check «Tabla de base de datos» pasa a ser el selector «Base de datos» (Ninguna, SQL Server, MongoDB, Firestore, Neo4j) en el editor del tipo. Cada nodo de ese tipo es una tabla, colección o etiqueta (como hasta ahora un nodo tabla era una tabla). `null` = el del ancestro o SQL Server, así que los proyectos de antes no cambian. «Tabla» (`isTableType`) sigue siendo solo SQL Server, y todo lo de SQL (columnas, script, linter, IA de tablas) queda igual; `isDatabaseType` y `engineOf` valen para cualquier motor (`database.ts`, `dbEngines.ts`).
- **Incrustar con un tipo «Subdocumento»** (`Schema.embedded`, heredable): no tiene colección propia; una referencia hacia él lo incrusta (simple: un objeto o mapa; múltiple: una lista). Se eligió frente a colgar nodos dentro de otros porque es por tipo (como las columnas), no exige crear nodos de cada subdocumento y la tarjeta lo despliega sangrado. Una referencia a otra colección guarda su id; a otro motor, el id como texto (y la línea va discontinua: la mantiene la aplicación). En Neo4j las referencias son relaciones.
- **Campos**: los metadatos de columna de siempre (`SqlColumn`, con los ajustes por tipo de preformas y heredados) más `docType`, el tipo en ese motor (o «Automático», deducido). Tarjeta «Campos del documento» / «Propiedades de Neo4j» (`DocumentFieldsCard`).
- **Firestore**: una colección cuyo nodo cuelga de otra colección de Firestore es su subcolección.

**Hecho:** motor y subdocumento en el editor del tipo; tarjetas de todos los motores en la disposición «Base de datos» (con el motor en la cabecera, `_id` en MongoDB, subdocumentos sangrados y líneas entre motores discontinuas); revisión en Salud (`documentLint.ts`: incrustación sin fin, más de 3 niveles, listas incrustadas sin límite —16 MB en MongoDB, 1 MiB en Firestore—, el mismo subdocumento en 3 o más colecciones, referencias sin destino o a otra base y nombres repetidos); exportaciones en el engranaje: MongoDB (script para mongosh con `$jsonSchema` e índices, repetible), reglas de Firestore (validación de campos, obligatorios, tipos, listas de opciones y subdocumentos; permisos de partida para quien tiene sesión), esquema de Neo4j (restricciones e índices; existencia y tipo, comentados porque son de Enterprise) y **el grafo entero de cualquier proyecto a Neo4j** (`projectCypher`: etiquetas por herencia, propiedades, fechas como `date()`, relaciones, referencias y jerarquía, repetible con MERGE).

**Verificado:** 11 pruebas nuevas (`nosql.test.ts`) y 404 en total; contra motores reales en el servidor, sin instalar nada en el sistema: MongoDB con mongodb-memory-server (7 comprobaciones: colección, índices por ruta, documento válido aceptado y tres inválidos rechazados, repetible), las reglas en el emulador oficial de Firestore (9 comprobaciones: válido, sin sesión, obligatorio, tipo, lista de opciones, campo desconocido, subdocumento y subcolección) y Neo4j Community 5.26 (11 comprobaciones: restricción e índice, grafo repetible sin duplicar, comillas, fechas, listas, relaciones, referencias y jerarquía). Edge: un proyecto con los cuatro motores en el mismo diagrama, el selector y la tarjeta de campos, y la descarga del script de MongoDB.

**Pendiente / más adelante:** lo de «Opcional» de arriba (importar un esquema existente, pasar de tablas a documentos, la IA para colecciones) y que el propietario lo pruebe con sus bases reales.
