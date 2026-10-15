# Diagramas de bases de datos

Fecha: 2026-10-14; rehecho el 2026-10-15. Estado: **tablas como tipos y disposición «Base de datos» publicadas (2026-10-15)**. La entrega del 2026-10-14 (configuración SQL por nodo y check «Esquema BD») se retiró por decisión del propietario. La asistencia por IA tiene su propio [roadmap bloqueado por la migración](ROADMAP_IA.md).

## Objetivo y alcance

Diseñar y explicar bases de datos en Nodaria: tablas, columnas, claves primarias y foráneas, nulabilidad, restricciones únicas y conjuntos de valores permitidos, con un diagrama legible y sin imponer una jerarquía de nodos. Mantener el núcleo generalista y los proyectos existentes.

## Evaluación del sistema actual

Revisión de `src/domain/types.ts`, `selectors.ts`, `constraints.ts`, `structure.ts`, `operations.ts`, `components/map/layout.ts` y `FloatingEdge.tsx`:

- Se puede representar cada tabla como un nodo raíz y describir columnas mediante atributos de un tipo; las relaciones dirigidas pueden ilustrar referencias entre tablas. No es obligatorio dar padres a los nodos.
- Alternativamente, cada tabla puede ser un tipo y sus atributos las columnas: las instancias representarían filas. Actualmente el mapa dibuja **instancias**, no un diagrama de los tipos. Crear tipos sin instancias no dibuja tablas.
- Las referencias actuales apuntan a nodos, no a una columna candidata de otra tabla. Las restricciones de relación admiten tipos y máximos por extremo; no son claves foráneas SQL ni verifican integridad entre columnas.
- `required` es obligatoriedad de una ficha; no equivale a `NOT NULL` SQL. Las listas de opciones son controles de entrada; no son constraints SQL declaradas. Faltan PK, unique individual/compuesto, FK compuestas y tipos SQL por dialecto.
- Genealogía tiene geometría especializada para parentescos y familias. Reutilizar sus reglas para tablas confundiría ambos dominios; sí se pueden reutilizar React Flow, tarjetas, geometría y enrutado.

**Conclusión:** sirve hoy para un boceto conceptual, pero no para un diseño relacional verificable. La petición necesita una vertical específica, no otra relación genérica que finja esas garantías.

## Revisión del proyecto de trabajo y prioridad confirmada

El 2026-10-14 el propietario prioriza esta iniciativa sobre el resto de mejoras y pide revisar su proyecto de tablas. Confirma **SQL Server como dialecto inicial**. Implementación todavía no iniciada; esta revisión no modifica ni convierte el proyecto remoto.

Lectura acotada de la copia sincronizada de **«Maestro de inventario (tablas)», versión 434**, mediante consultas SELECT parametrizadas por cuenta y proyecto. Se identificó también el proyecto «Maestro de inventario (relaciones)», pero el análisis detallado se centró en el de tablas solicitado. No se almacenan aquí UID, documentos completos ni datos de cuenta.

- 33 tipos: 29 de entidad (27 concretos y dos bases abstractas, Archivo físico y Archivo lógico) y cuatro de relación (0, 1, N y M).
- 27 nodos, uno por tipo concreto, todos raíz; cero relaciones instanciadas y **34 vínculos por valores de atributos de referencia**. Los tipos 0/1/N/M no expresan actualmente cardinalidades SQL.
- Se reutilizan columnas mediante herencia y diez preformas. Tablas de unión como sede-empresas, empresa-dptos, Miembro-dpto y Acreedor-articulos muestran una intención relacional coherente; su validez concreta depende de las reglas del negocio.
- El propietario usa deliberadamente valores iniciales y valores de nodos como **notación visual** de tipo SQL (`text(50)`, `Datetime`, `numeric(10,2)`), iconos por columna y presentación en tarjeta. Aclara que distingue PK/FK mediante iconos de llave y representa FK con referencias a nodos. Es un recurso para dibujar tablas con la interfaz actual, no un intento de declarar constraints que la aplicación interprete. Las diferencias entre anotaciones, por ejemplo Serie en Factura, no condicionan el nuevo modelo ni requieren conversión en la primera entrega.
- `Id` es un atributo obligatorio de texto, sin PK ni unicidad declarada. Las referencias como Almacen.Id_sede → Sede apuntan al nodo de la tabla; no a Sede.Id. Los campos de referencia revisados tienen la lista de tipos permitidos vacía, por lo que el selector tampoco restringe por sí mismo al tipo de tabla esperado.
- `Estado` en persona-peticionesDePedidos es **texto**, con valor inicial y actual «Lista de opciones» y sin opciones declaradas; no es un selector. No hay campos efectivos de tipo `select` en este proyecto. Esto no reproduce ni cierra R2-02.
- Pedido.Fecha_limite_llegada está definido, pero no tiene valor en su nodo antiguo. `cardContent` omite los atributos vacíos: el mapa muestra valores de instancias, no todas las definiciones. Una vista de esquema debe mostrar la columna incluso vacía; el editor de ficha actual sí recorre los campos efectivos sin exigir valor guardado.

**Diagnóstico aplicado:** el planteamiento del propietario es razonable para las herramientas disponibles. La necesidad principal es añadir capacidades de diseño de esquema, separando definición de tabla, fila de datos y tarjeta del mapa. No basta con enseñar un menú existente ni con cambiar a Genealogía.

### Decisión vigente (2026-10-15): un tipo es una tabla y «Base de datos» es una disposición

El propietario rechazó la entrega del 2026-10-14: la tabla se definía en la ficha de cada nodo en lugar de en la gestión de tipos, convertir un nodo en tabla obligaba a escribir todas las columnas desde cero en vez de reutilizar sus propiedades y el check «Esquema BD» no era una disposición. Pide que tabla y nodo solo se diferencien por un check y que la base de datos sea una disposición más, junto a Jerárquica y Fuerzas.

- **Tipo = tabla.** «Tabla de base de datos» es un check del editor de tipos (`Schema.table`). Se hereda: marcar una base (en su proyecto, «Archivo físico» y «Archivo lógico») convierte a todos sus subtipos.
- **Atributos = columnas.** Las columnas son los atributos efectivos del tipo: propios, preformas y heredados. Cada atributo lleva metadatos SQL opcionales (`FieldDefinition.sql`): tipo, PK, nulos, UNIQUE, IDENTITY y si forma parte de la tabla. Sin metadatos, se deducen del tipo del atributo, así que marcar un tipo ya produce columnas. El título del nodo es el nombre de la tabla y no es columna; los calculados y las referencias múltiples tampoco, por defecto.
- **Referencias = claves foráneas.** Una referencia (`nodeRef`) de un nodo tabla que apunta a otro nodo tabla es una FK hacia su clave primaria, y toma su tipo. Se deduce de los valores de las fichas: no hay otra definición que pueda divergir.
- **El nodo sigue siendo un nodo.** En las demás disposiciones se ve como siempre. En «Base de datos» los nodos de tipos tabla se dibujan como tablas, con una fila por columna, y las FK como líneas en ángulo recto de fila a fila, con ∞ en la FK y una llave en la PK, como el diagrama de SQL Server. Los nodos que no son tablas se colocan debajo, en jerárquica.
- **Las posiciones** usan las de cada disposición (`Node.positions.database`): arrastrar, chinchetas, «Recolocar», deshacer y recarga funcionan como en el resto.
- **Anotaciones.** Su proyecto escribía los tipos SQL como valor inicial («text(50)», «numeric(10,2)», «Datetime», «Si/No»). El editor los reconoce y un botón los convierte en el tipo SQL de la columna en todas las tablas a la vez, quitando el valor inicial y los valores de ficha que solo repetían la anotación. Es deshacible.

### Decisiones de negocio que el editor debe ayudar a revisar

Son propuestas pendientes del propietario, no errores demostrados ni cambios aplicados:

- En una unión como sede-empresas, decidir si se prohíbe repetir `(Id_sede, Id_empresa)` mediante PK/unique compuesta, aun conservando un Id artificial. En almacen-articulos, Fecha_entrada/Cantidad sugieren que podría haber varias entradas del mismo artículo: no imponer una unique del par sin aclararlo.
- Pedidos, peticiones, presupuestos y facturas no tienen en este boceto líneas que indiquen artículo, cantidad y precio; sí existe Albaran-articulos. Si esos documentos necesitan detalle de productos, proponer sus tablas de líneas sin asumir que todos usan el mismo detalle.
- Factura enlaza Empresa/Acreedor como datos fiscales. Si se necesita conservar el contenido histórico al cambiar esas entidades, diseñar copia o versión de esos datos, no solo una referencia al estado actual.
- Revisar Teléfono y Cod_ean como identificadores de texto si deben conservar ceros iniciales o prefijos; cantidades e importes tienen otra semántica. Base_imponible aparece anotada como texto y debe revisarse si se pretende operar con ella como cantidad decimal.

### Reglas y fuentes para SQL Server

El editor distingue PK, claves candidatas unique, FK y obligatoriedad de formulario. La PK puede ser compuesta y exige columnas no nullable; una FK referencia una clave candidata válida. Véase [claves primarias y foráneas de SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints?view=sql-server-ver17). `numeric` y `decimal` son equivalentes de precisión/escala explícitas; véase [decimal/numeric](https://learn.microsoft.com/en-us/sql/t-sql/data-types/decimal-and-numeric-transact-sql?view=sql-server-ver17). El alcance inicial se probará contra SQL Server, no contra una abstracción supuestamente idéntica en todos los motores. No se ejecutará DDL sobre la base del proyecto revisado.

## Modelo vigente (formato 6)

- `src/domain/database.ts`: tipos de SQL Server (`SqlDataType`), `SqlColumn`, `isTableType`/`tableOrigin`, `tableFields`/`tableColumns` (con el origen de cada columna), deducción de tipos, `parseSqlAnnotation`, `foreignKeyLinks`, `tableIssues` (sin PK, columnas repetidas, varias IDENTITY, PK que admite nulos, longitudes y precisiones fuera de rango, FK hacia PK compuesta o con otro tipo, referencias múltiples), `setFieldSql` (cambia el atributo allí donde esté: tipo propio, ancestro o biblioteca) y `applySqlAnnotations`.
- Acciones `set-field-sql` (agrupada por atributo en el historial) y `apply-sql-annotations`. La marca de tabla usa `update-schema`.
- Interfaz: check en `SchemaEditor`, tarjeta «Columnas SQL» (`SqlColumnsCard`) con tipo automático o elegido, longitud/precisión/escala, PK, nulos, único, IDENTITY y «En la tabla»; disposición `database` en `FlowCanvas`, tarjeta `TableCard` en `NodeCard`, geometría en `tableCard.ts` (medidas fijas compartidas con `database.css`), arista `ForeignKeyEdge` y distribución `databaseLayout` en `layout.ts`: columnas según la profundidad de las FK (las referenciadas a la izquierda), orden por baricentro, columnas largas partidas para una proporción de pantalla, tablas sueltas al final y el resto de nodos debajo.
- Formato **6**: se descartan el bloque `databaseDesign` y `view.databaseSchema` de v5. No se pueden traducir a tipos y, en la base de la API, el único proyecto que los tenía («Maestro de inventario (tablas)») tenía 0 tablas y 0 FK. Una copia local con tablas de v5 creadas solo en un navegador se perdería. Los metadatos dañados se leen como deducidos. Una pestaña con la versión anterior rechaza los proyectos v6 («necesita una versión más reciente»): basta con recargar.

Pendientes: claves UNIQUE compuestas con nombre, FK compuestas, defaults SQL, CHECK, índices, reglas ON DELETE/UPDATE, cardinalidades en las líneas, enrutado que esquive tablas y exportar DDL.

## Hitos y criterios de cierre

- [x] **0. Evaluación:** documentar capacidades y límites actuales, alternativa tabla/nodo frente a tabla/tipo y dependencia de IA. Evidencia: revisión de código y lectura acotada del proyecto real de tablas del 2026-10-14; dialecto SQL Server confirmado. Sin llamadas a proveedores ni cambios de bases.
- [x] **1. Modelo y validación manual (2026-10-15, alcance de tipos):** definir y probar columnas, PK, unique, FK, nulabilidad y valores permitidos. Rechazar referencias a columnas inexistentes, componentes repetidos, FK con longitud incompatible y destinos sin clave candidata válida. Comprobar compatibilidad de tipos según dialecto; permitir FK autorreferentes y ciclos válidos sin imponer un árbol.
- [x] **2. Editor de esquema (alcance inicial manual):** configurar nodos como tablas y crear sus columnas; editar tipos SQL y constraints compuestas y mostrar diagnósticos comprensibles. Validar renombrados, borrados y dependencias. Mantener fichas de nodos y Tabla como funciones distintas de la vista del esquema.
- [x] **3. Diagrama relacional (2026-10-15, sin cardinalidades ni enrutado que esquive tablas):** tarjetas de tabla con filas de columnas e insignias PK/FK/unique/nullable; puertos por columna o constraint, líneas ortogonales y cardinalidades justificadas. Distribución de grafo sin padres obligatorios, posiciones manuales estables, filtros, zoom y deshacer. El dibujo debe reflejar las FK declaradas automáticamente.
- [ ] **4. Ayuda estructural sin IA:** proponer tablas intermedias cuando el usuario declara una relación muchos-a-muchos; explicar opciones y generar una vista previa editable. No deducir una tabla ausente como hecho ni crearla silenciosamente. Aplicar el conjunto aceptado en una operación deshacible.
- [ ] **5. Persistencia y casos de prueba:** exportar/importar los metadatos, migrar proyectos antiguos sin alterarlos y probar un caso comercial con clientes/pedidos/líneas/productos, PK/FK compuestas, autorreferencia, ciclo, unique, columnas nullable y valores limitados.
- [ ] **6. Integración con IA:** solo después de cumplir los requisitos de `ROADMAP_IA.md`; la IA propone operaciones del mismo editor, sin un modelo paralelo.
- [ ] **7. Exportación opcional:** DDL por dialecto con nombres escapados y reglas comprobadas; vista previa y descarga. Fuera del alcance inicial: conectarse a bases, importar filas reales o ejecutar DDL.

## Verificación y decisiones pendientes

Dialecto inicial confirmado: **SQL Server**. Antes de programar el nuevo modelo: concretar versión mínima, alcance inicial de tipos/identidad/defaults/índices, diferencias entre validar filas de ejemplo y validar un esquema, y alcance del DDL. La representación acordada es una capa SQL asociada a los nodos existentes, dentro del mismo proyecto mixto. Son decisiones de esta vertical; no se trasladan a Administración.

Pruebas de dominio e integridad para las restricciones y operaciones; migraciones y round trips JSON; navegador para edición, aristas por columna, casos sin jerarquía, ciclo, posiciones y deshacer. Un SQL descargado no se declara válido hasta comprobarlo con el dialecto elegido en un entorno de prueba.

## Verificación de la primera entrega

La entrega anterior pasó lint, build y 278 pruebas de 40 archivos, con pruebas de dominio/persistencia y Edge con proyectos sintéticos: nodos mixtos, configuración conservando id/tipo/notas/valores, referencias generales a tablas, FK en mapa/Conexiones, claves compuestas y autorreferentes, borrado/deshacer y round trips JSON. La integración final pasa **283 pruebas de 42 archivos**. Comprobado en Edge: ausencia de botón SQL en navegación, activación al configurar la primera tabla, invariancia de posiciones de nodos normales al alternar el check, arrastre exclusivo de tabla, almacenamiento separado, deshacer/rehacer y recarga. No se han convertido ni modificado los proyectos del propietario. Publicación y verificación final se registran en `PROJECT_CONTEXT.md` y `bugs.md`.

Publicación del 2026-10-14: código `650536c`, Hosting `ee2c4b2b48fe6537`. Verificación repetida en producción del check, posiciones separadas, primer nodo tabla, historial y recarga. La primera entrega está disponible; los hitos posteriores siguen en pausa mientras se cierran los bugs.

## Verificación de la entrega del 2026-10-15

Lint, formato, build y 272 pruebas de 41 archivos (13 nuevas: anotaciones, herencia y preformas como columnas, tipo de FK desde la PK destino, PK sin nulos, FK solo entre tablas, avisos, conversión de anotaciones, formato 6, lectura de metadatos dañados, rutas de las líneas y distribución). En Edge sin interfaz, con perfil aislado y una copia local de «Maestro de inventario (tablas)» leída de la base (sin sesión, sin sincronizar): disposición desactivada sin tablas, check heredado en los subtipos, columnas propias/heredadas/preformas, FK `id_sede → Sede`, conversión de 27 anotaciones, `id` como int PK IDENTITY, 33 tablas y 45 FK dibujadas, arrastre con chincheta, deshacer, recarga y vuelta a tarjetas normales en Fuerzas, sin errores JavaScript. El proyecto de la cuenta de trabajo no se ha modificado.
