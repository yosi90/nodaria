# Datos y consultas en las tablas

Fecha: 2026-10-23. Estado: **implementado el 2026-10-23** (ver «Verificación»). Nace de R3-05 en [`bugs.md`](../../bugs.md): «Crear la funcionalidad para rellenar valores en las tablas y poder hacer consultas». Las decisiones abiertas se resolvieron con la opción recomendada y se pueden revisar. Están marcadas como **(revisable)**.

## Objetivo

Hasta ahora una tabla de Nodaria era solo su diseño: columnas, claves y reglas. Con esto se pueden escribir filas de ejemplo en cada tabla y consultarlas con SQL. Así se comprueba que el diseño responde a las preguntas del negocio antes de crear la base, y las filas salen en el script como `INSERT`.

Fuera del alcance: conectarse a una base real, ejecutar el script contra ella, importar filas de una base existente y los motores de documentos (MongoDB, Firestore, Neo4j).

## Modelo (formato 12, `src/domain/tableData.ts`)

- **Dónde viven las filas.** En una tabla de Nodaria, el nodo es la tabla: su título es el nombre de la tabla y sus atributos, las columnas. Por eso las filas no son nodos. Se guardan aparte, por nodo tabla, en `Project.tableData: Record<nodeId, { rows: TableRow[] }>`.
- **Celdas.** `TableRow = { id, cells: Record<clave, string | boolean | null> }`.
  - La clave es el id del atributo, que se mantiene aunque cambie el nombre de la columna. En una referencia a una clave compuesta, cada parte es `atributo:columnaDestino`.
  - Los valores se guardan como texto ya normalizado (booleano en `bit`/`BOOLEAN`), para que un DECIMAL(15,2) no pierda precisión. Al normalizar, la coma decimal y los miles de una hoja en español pasan a punto (`1.234,50` → `1234.50`), las fechas DD/MM/AAAA pasan a ISO y sí/no, 1/0 o x pasan a booleano.
- **Columnas que cambian.** Una celda cuya columna ya no existe se conserva pero no se muestra. Si la columna vuelve (por ejemplo, al deshacer), reaparece su valor. Al cambiar el tipo de una columna, las celdas que ya no encajan se marcan como error, pero no se borran.
- **Límites:** 5.000 filas por tabla y 4.000 caracteres por celda. Caben de sobra en los 20 MB por proyecto de la API. **(revisable)**
- **Consultas guardadas.** `Project.sqlQueries: { id, name, sql }[]`, hasta 20.000 caracteres. Son distintas de las consultas de nodos (`Project.queries`).
- **Borrados e integridad.** Al borrar un nodo tabla se borran sus filas. La comprobación de integridad quita las filas de nodos que ya no existen o que ya no son tablas. Al leer un archivo, lo que no se entiende se descarta.
- **Publicar.** Un proyecto público **no lleva las filas ni las consultas** (como la agenda): pueden ser datos reales del trabajo. El diálogo de publicar lo dice y la política de privacidad, también. Decidir si se publican le toca al propietario, porque cambia lo que sale del navegador. **(revisable)**
- **El asistente de IA no recibe las filas** (su contexto no las incluye). Enviarlas también cambiaría lo que sale del navegador y le toca al propietario.
- **Fusión** (importar en un proyecto): se añaden las tablas y las consultas que faltan. En las tablas que ya existen se conservan las filas del proyecto de destino.
- **Deshacer.** Cada cambio de las filas se deshace. Escribir en una celda cuenta como un solo paso por celda.

## Vista «Registros» (`src/components/records/`)

- La vista está en el grupo «Datos», con el atajo Alt+9, en la paleta y en el menú contextual. Solo aparece si el proyecto tiene tablas relacionales (SQL Server o Db2 for i). **(revisable: el nombre)**
- **A la izquierda**, la lista de tablas (agrupadas por motor si hay de los dos) con su número de filas y de errores, y las consultas guardadas con «Nueva». En el móvil, la lista va arriba.
- **Hoja de la tabla** (`RecordsGrid`).
  - Una columna por cada columna del script: los mismos nombres y el mismo orden. Debajo de cada nombre van el tipo (con *packed* y *zoned* en Db2), si es automática y a qué tabla apunta. Una llave marca la PK y un eslabón, la FK.
  - Se escribe directamente en la celda. El valor se guarda al salir o con Intro, que baja a la fila siguiente (y en la última crea otra). Escape deshace lo escrito.
  - Controles según la columna: una lista Sí/No en `bit`/`BOOLEAN`, una lista en las columnas con opciones y otra en las FK, con las claves de la tabla destino y su primer texto («2 · Bruno»).
  - La celda vacía enseña lo que pondrá la base: `auto` en IDENTITY, `= GETDATE()` con un valor por defecto y `NULL` si admite nulos.
  - Las IDENTITY se numeran al crear la fila (el mayor + 1), para poder apuntarlas desde otra tabla.
  - **Pegar desde Excel o desde un CSV** (Ctrl+V sobre una celda; en una tabla vacía, en su casilla «Pega aquí»): rellena desde esa celda hacia la derecha y hacia abajo y crea las filas que falten. Reconoce tabuladores, punto y coma o comas, y comillas.
  - Marcar filas para duplicarlas o borrarlas (con «Deshacer»). Páginas de 100 filas.
- **Validación**, con las reglas de la base. Cada error se marca en su celda y se explica al pasar por encima:
  - el tipo de cada columna: enteros y su rango; decimal, *packed* y *zoned* con su precisión y escala; textos con su longitud; fechas y horas; GUID; binario en hexadecimal;
  - NOT NULL, salvo IDENTITY o un valor por defecto;
  - la PK, simple o compuesta, sin repetir; las UNIQUE, simples y compuestas. En SQL Server una UNIQUE admite un solo NULL; lo descubrió el script en SQL Server Express y se avisa así. En Db2 for i, las filas con un nulo no cuentan, **pendiente de confirmar en el AS/400**;
  - el CHECK de las listas;
  - que cada FK, también compuesta, exista en la tabla destino.
- **Consultas** (`QueryPanel`).
  - Un editor SQL que se guarda al escribir, con su nombre. Debajo van las tablas, que se insertan con un clic.
  - «Ejecutar» o Ctrl+Intro; «Cancelar» mientras se ejecuta.
  - El resultado enseña hasta 1.000 filas, cuántas hay (se cuentan hasta 100.000) y el tiempo, y se descarga en CSV con punto y coma.

## Motor de consultas (`sqlQuery.ts`, `services/sqlWorker.ts`, `sqlEngine.ts`, `sqlRunner.ts`)

- Se usa **SQLite en el navegador**: `sql.js` 1.14.2, publicado en agosto de 2026, en lugar de la 1.15, que tiene días.
  - Va en un *worker*, para que una consulta pesada no congele la página. Se corta a los 20 segundos o con «Cancelar», terminando el *worker*.
  - Se descarga solo con la primera consulta: 42 kB de *worker* y 658 kB de `.wasm`, desde el propio origen. El bundle principal no crece.
  - La CSP añade `'wasm-unsafe-eval'` a `script-src`. Solo deja compilar WebAssembly, no `eval`. No afecta al script de Yosiftadísticas ni al SDK de la plataforma. **(revisable)**
- En cada ejecución se crea una base en memoria con todas las tablas (nombres del script, tipos con su afinidad en SQLite y sin restricciones) y todas sus filas. Después se ejecuta la consulta y se descarta la base, así que las consultas no pueden cambiar los datos.
- Solo se admiten consultas que leen (`SELECT`, `WITH`, `VALUES`). Ante cualquier otra cosa, se explica que las filas se editan en la hoja.
- **Dialectos.** SQLite entiende casi todo lo habitual de SQL Server y de Db2 (JOIN, GROUP BY, subconsultas, CTE, `[corchetes]` y `"comillas"`). Antes de ejecutar se traduce, siempre fuera de los textos y comentarios:
  - `TOP n` / `TOP (n)` y `FETCH FIRST|NEXT n ROWS ONLY` → `LIMIT n`, con `OFFSET`;
  - `GETDATE()`, `SYSDATETIME()` y `CURRENT TIMESTAMP|DATE|TIME` → la forma de SQLite;
  - `ISNULL`, `LEN`, `SUBSTRING`, `UCASE` y `LCASE`;
  - el prefijo `dbo.` y el de la biblioteca de Db2 del proyecto.

  Lo que no se traduce da el error de SQLite tal cual, con una nota de que el motor es SQLite.

## Script y fuentes (`rowsScript.ts`)

- Las filas van en un `INSERT` por fila, **después de crear las tablas y antes de las claves foráneas**. Así no importa el orden de las tablas, valen los ciclos y la base comprueba las FK al crearlas.
  - Una fila con errores se deja comentada con el motivo, porque haría fallar el script entero.
  - Las celdas vacías no se escriben: la columna toma su DEFAULT o NULL.
- **SQL Server** (el script que ya descargaban el engranaje y el lienzo, sin diálogo): siempre que haya filas.
  - Las IDENTITY con número van entre `SET IDENTITY_INSERT ... ON/OFF`.
  - Los textos `nchar`/`nvarchar` van con `N'...'` y las fechas con hora, con la `T` de ISO 8601, que no depende del idioma de la sesión.
- **Db2 for i:** casilla «Las filas de ejemplo» en el diálogo de exportar, activada si las tablas elegidas tienen filas.
  - El script `.sql` usa `OVERRIDING SYSTEM VALUE` y después reinicia la identidad detrás del mayor número (`ALTER COLUMN ... RESTART WITH`).
  - En las fuentes, el miembro `QSQLSRC/DATOS` lo ejecuta el CL de SQL antes de `CLAVES`.
  - Con DDS, el miembro `DATOSPF` usa los nombres de sistema y no lleva IDENTITY. El CL de DDS lo ejecuta con RUNSQLSTM después de CRTPF/CRTLF y antes de ADDPFCST.

## Hitos

- [x] **1. Modelo y validación.** Formato 12, `tableData` y `sqlQueries`; migración, integridad, borrado de nodos, fusión y publicación sin filas; validación y pruebas.
- [x] **2. Hoja «Registros».** Vista, lista de tablas, edición, pegar, IDENTITY, deshacer y errores; Edge.
- [x] **3. INSERT en los scripts.** SQL Server (comprobado en SQL Server Express), Db2 `.sql` y miembros `DATOS` y `DATOSPF`. Falta la prueba en el AS/400.
- [x] **4. Consultas.** sql.js en un *worker*, CSP, traducciones, resultados, CSV y consultas guardadas; Edge en local, con el build y la CSP de producción.

## Verificación

- **Pruebas:** `tableData.test.ts`, `sqlQuery.test.ts` (ejecuta SQLite de verdad con sql.js en Node) y `rowsScript.test.ts`: 14 pruebas nuevas, más las de CSP y publicación actualizadas. Lint, build y 440 pruebas del front.
- **SQL Server Express:** el script del caso comercial con 12 filas en 8 tablas, sobre una base desechable que después se borró.
  - Se crean las tablas, las filas, la clave compuesta, la autorreferencia y el ciclo empleado ↔ departamento, y las FK se crean después sin errores.
  - La fecha vacía toma `GETDATE()` y el decimal `1.234,50` queda en 1234.50.
  - La IDENTITY sigue contando desde el mayor.
  - La fila sin nombre sale comentada.
  - Insertar otro cliente con el email NULL choca con la UNIQUE, y eso cambió la validación.
- **Edge (`check-records.cjs`):** 25 comprobaciones en el servidor de desarrollo y otra vez sobre `dist/` servido con la CSP de `firebase.json`, sin errores JavaScript ni violaciones de la CSP:
  - sin tablas no aparece la vista, y con tablas sí;
  - IDENTITY, foco e Intro;
  - errores y su explicación;
  - pegar con coma decimal y la escala del decimal;
  - FK, opciones y DEFAULT;
  - borrar y deshacer;
  - la consulta con TOP, `dbo.` y LEFT JOIN, la que no lee y el error de SQLite;
  - el nombre de la consulta;
  - 390 px.
- **Pendiente con el propietario:** probar `DATOS`/`DATOSPF` en el AS/400 y confirmar cómo trata los nulos una UNIQUE de Db2 for i.
