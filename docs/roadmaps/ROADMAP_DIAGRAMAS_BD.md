# Diagramas de bases de datos

Fecha: 2026-10-14. Estado: **primera entrega integrada; ampliación en pausa mientras se terminan los bugs**. La prioridad vigente del propietario es cerrar la segunda ronda de `bugs.md`. La parte manual no depende de IA ni requiere adelantar la migración de cuentas. La asistencia por IA tiene su propio [roadmap bloqueado por la migración](ROADMAP_IA.md).

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

### Decisión vigente: tablas como nodos, Esquema BD como capa del mapa

El propietario concreta que quiere **mezclar nodos normales y tablas en un mismo proyecto**. Una tabla es un nodo marcado con estructura SQL, conserva su tipo general, propiedades, notas, padre, referencias y relaciones. Esquema BD es una vista de esos nodos; no es otro conjunto de datos que ocupe el proyecto ni un reemplazo del mapa mental.

Las columnas SQL son definiciones asociadas al nodo tabla, con metadatos estructurados. No son valores de su ficha ni se convierten en filas de datos. Las propiedades generales describen el nodo (responsable, estado, documentación...) y pueden seguir reutilizando tipos, preformas y herencia. Las referencias generales pueden apuntar tanto a tablas como a cualquier otro nodo. Una FK SQL solo referencia columnas de nodos que también son tablas.

Desde una ficha se configura su nodo como tabla SQL. **Esquema BD es un check junto a etiquetas, color por comunidad y tamaño por centralidad**, no otra entrada de la navegación Esquema. Al marcarlo, solo las tablas reciben distribución y posiciones SQL; los demás nodos conservan la disposición activa y sus anclajes. Configurar la primera tabla lo activa por defecto; añadir tablas posteriores respeta una desactivación explícita. El mapa muestra las columnas y conexiones FK junto con el contenido general. No se añaden controles SQL al árbol general. Los editores de tabla y FK se abren desde la ficha común.

Se descarta la separación inicial de tablas sin nodos. El boceto original sigue siendo referencia de necesidades, no se interpreta ni convierte automáticamente desde iconos o textos. El nombre SQL puede diferir del título general del nodo; renombrar un contexto narrativo no debe cambiar silenciosamente un identificador SQL.

### Decisiones de negocio que el editor debe ayudar a revisar

Son propuestas pendientes del propietario, no errores demostrados ni cambios aplicados:

- En una unión como sede-empresas, decidir si se prohíbe repetir `(Id_sede, Id_empresa)` mediante PK/unique compuesta, aun conservando un Id artificial. En almacen-articulos, Fecha_entrada/Cantidad sugieren que podría haber varias entradas del mismo artículo: no imponer una unique del par sin aclararlo.
- Pedidos, peticiones, presupuestos y facturas no tienen en este boceto líneas que indiquen artículo, cantidad y precio; sí existe Albaran-articulos. Si esos documentos necesitan detalle de productos, proponer sus tablas de líneas sin asumir que todos usan el mismo detalle.
- Factura enlaza Empresa/Acreedor como datos fiscales. Si se necesita conservar el contenido histórico al cambiar esas entidades, diseñar copia o versión de esos datos, no solo una referencia al estado actual.
- Revisar Teléfono y Cod_ean como identificadores de texto si deben conservar ceros iniciales o prefijos; cantidades e importes tienen otra semántica. Base_imponible aparece anotada como texto y debe revisarse si se pretende operar con ella como cantidad decimal.

### Reglas y fuentes para SQL Server

El editor distingue PK, claves candidatas unique, FK y obligatoriedad de formulario. La PK puede ser compuesta y exige columnas no nullable; una FK referencia una clave candidata válida. Véase [claves primarias y foráneas de SQL Server](https://learn.microsoft.com/en-us/sql/relational-databases/tables/primary-and-foreign-key-constraints?view=sql-server-ver17). `numeric` y `decimal` son equivalentes de precisión/escala explícitas; véase [decimal/numeric](https://learn.microsoft.com/en-us/sql/t-sql/data-types/decimal-and-numeric-transact-sql?view=sql-server-ver17). El alcance inicial se probará contra SQL Server, no contra una abstracción supuestamente idéntica en todos los motores. No se ejecutará DDL sobre la base del proyecto revisado.

## Modelo de la primera entrega

`Project.databaseDesign` es un bloque opcional de **configuración SQL de los nodos**. `DatabaseTable.id` coincide con `Node.id`, no tiene identidad independiente. Cada tabla guarda esquema/nombre SQL, columnas ordenadas con ids locales, tipo SQL estructurado, nulabilidad, IDENTITY(1,1), PK y claves UNIQUE ordenadas. Las FK guardan los ids de los nodos origen/destino y sus columnas emparejadas. Las posiciones de la vista SQL son independientes de las posiciones del mapa general.

Una FK tiene una única definición. `referenceFields`/`referenceLinks` la proyectan como vínculo de los nodos con id transitorio `sql-fk:<id>`; no se guarda otra relación que pueda divergir. Así participa en mapa, conexiones, filtros de referencias, caminos, aislamiento y análisis mediante los mecanismos existentes. Una FK compuesta sigue siendo una sola restricción. El dibujo actual usa las aristas comunes del mapa; los puertos por columna y el enrutado relacional especializado quedan para el hito de diagrama.

Borrar un nodo por los controles existentes retira su estructura SQL y las FK dependientes en la misma operación. Quitar solo la configuración SQL conserva el nodo y sus conexiones generales. Duplicar un nodo tabla conserva las columnas y claves, con nombres SQL nuevos, y respeta la opción de copiar conexiones. Borrar una columna retira las constraints dependientes completas, nunca reduce una clave compuesta a una diferente; el editor muestra las FK que se retirarán antes de guardar. Todas estas operaciones usan el historial común.

Formato de proyecto **5**: el bloque es opcional y los proyectos antiguos no se marcan ni convierten. Carga/importación conservan definiciones y posiciones; un bloque estructuralmente dañado se rechaza para rescatar el original. Se rechazan formatos futuros en lugar de guardarlos perdiendo datos. No usar simultáneamente versiones antiguas del frontend para editar proyectos con configuración SQL: esas versiones todavía no conocen este bloque.

### Alcance implementado localmente

- Editor manual de nodos tabla: tipos iniciales de SQL Server (enteros, bit, decimal/numeric, texto/binario con longitud, fechas/horas y uniqueidentifier), nulabilidad, IDENTITY para enteros, PK y UNIQUE simples/compuestas.
- FK hacia PK/UNIQUE completa, componentes ordenados, comprobación de existencia y compatibilidad de tipos; autorreferencias y ciclos. Acciones referenciales iniciales: NO ACTION.
- Tarjetas comunes con columnas e indicadores automáticos PK/FK/UQ; check Esquema BD que distribuye únicamente tablas, posiciones manuales SQL separadas y deshacibles. Se retira la página independiente y su diagrama especializado para mantener una única experiencia de mapa.
- Integración con nodos, fichas, referencias generales y mapa mixto; guardado IndexedDB, duplicación, borrado, importación/exportación JSON y deshacer/rehacer.

Pendientes: defaults SQL, CHECK/valores permitidos, índices y colación configurables, reglas de cascada/SET NULL, validación exhaustiva del motor, cardinalidades del diagrama, enrutado que esquive otras tarjetas y distribución por conectividad. La distribución inicial es una rejilla con colocación manual; no se presenta como un optimizador de diagramas. Exportar DDL y proponer tablas intermedias son hitos posteriores. La IA espera la migración.

## Hitos y criterios de cierre

- [x] **0. Evaluación:** documentar capacidades y límites actuales, alternativa tabla/nodo frente a tabla/tipo y dependencia de IA. Evidencia: revisión de código y lectura acotada del proyecto real de tablas del 2026-10-14; dialecto SQL Server confirmado. Sin llamadas a proveedores ni cambios de bases.
- [ ] **1. Modelo y validación manual:** definir y probar columnas, PK, unique, FK, nulabilidad y valores permitidos. Rechazar referencias a columnas inexistentes, componentes repetidos, FK con longitud incompatible y destinos sin clave candidata válida. Comprobar compatibilidad de tipos según dialecto; permitir FK autorreferentes y ciclos válidos sin imponer un árbol.
- [x] **2. Editor de esquema (alcance inicial manual):** configurar nodos como tablas y crear sus columnas; editar tipos SQL y constraints compuestas y mostrar diagnósticos comprensibles. Validar renombrados, borrados y dependencias. Mantener fichas de nodos y Tabla como funciones distintas de la vista del esquema.
- [ ] **3. Diagrama relacional:** tarjetas de tabla con filas de columnas e insignias PK/FK/unique/nullable; puertos por columna o constraint, líneas ortogonales y cardinalidades justificadas. Distribución de grafo sin padres obligatorios, posiciones manuales estables, filtros, zoom y deshacer. El dibujo debe reflejar las FK declaradas automáticamente.
- [ ] **4. Ayuda estructural sin IA:** proponer tablas intermedias cuando el usuario declara una relación muchos-a-muchos; explicar opciones y generar una vista previa editable. No deducir una tabla ausente como hecho ni crearla silenciosamente. Aplicar el conjunto aceptado en una operación deshacible.
- [ ] **5. Persistencia y casos de prueba:** exportar/importar los metadatos, migrar proyectos antiguos sin alterarlos y probar un caso comercial con clientes/pedidos/líneas/productos, PK/FK compuestas, autorreferencia, ciclo, unique, columnas nullable y valores limitados.
- [ ] **6. Integración con IA:** solo después de cumplir los requisitos de `ROADMAP_IA.md`; la IA propone operaciones del mismo editor, sin un modelo paralelo.
- [ ] **7. Exportación opcional:** DDL por dialecto con nombres escapados y reglas comprobadas; vista previa y descarga. Fuera del alcance inicial: conectarse a bases, importar filas reales o ejecutar DDL.

## Verificación y decisiones pendientes

Dialecto inicial confirmado: **SQL Server**. Antes de programar el nuevo modelo: concretar versión mínima, alcance inicial de tipos/identidad/defaults/índices, diferencias entre validar filas de ejemplo y validar un esquema, y alcance del DDL. La representación acordada es una capa SQL asociada a los nodos existentes, dentro del mismo proyecto mixto. Son decisiones de esta vertical; no se trasladan a Administración.

Pruebas de dominio e integridad para las restricciones y operaciones; migraciones y round trips JSON; navegador para edición, aristas por columna, casos sin jerarquía, ciclo, posiciones y deshacer. Un SQL descargado no se declara válido hasta comprobarlo con el dialecto elegido en un entorno de prueba.

## Verificación de la primera entrega

La entrega anterior pasó lint, build y 278 pruebas de 40 archivos, con pruebas de dominio/persistencia y Edge con proyectos sintéticos: nodos mixtos, configuración conservando id/tipo/notas/valores, referencias generales a tablas, FK en mapa/Conexiones, claves compuestas y autorreferentes, borrado/deshacer y round trips JSON. La integración final pasa **283 pruebas de 42 archivos**. Comprobado en Edge: ausencia de botón SQL en navegación, activación al configurar la primera tabla, invariancia de posiciones de nodos normales al alternar el check, arrastre exclusivo de tabla, almacenamiento separado, deshacer/rehacer y recarga. No se han convertido ni modificado los proyectos del propietario. Publicación y verificación final se registran en `PROJECT_CONTEXT.md` y `bugs.md`.
