# Bases de datos no relacionales

Fecha: 2026-10-22. Estado: **planificado, sin empezar**. No es el roadmap activo principal (lo es [`ROADMAP_CALENDARIO.md`](ROADMAP_CALENDARIO.md), a falta del piloto). Propuesta para que el propietario decida; las decisiones marcadas como «propuesta» esperan su confirmación (ver «Preguntas abiertas»).

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
