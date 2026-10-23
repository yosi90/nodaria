import type { ReactNode } from 'react';

/**
 * Guía de las bases de datos: tablas como tipos, columnas, claves, Db2 for i, las filas de ejemplo de
 * «Registros», las consultas, la revisión y las exportaciones (docs/roadmaps/ROADMAP_DIAGRAMAS_BD.md,
 * ROADMAP_NOSQL.md y ROADMAP_DATOS_BD.md).
 */
export function DatabaseGuide() {
  return (
    <div className="guide">
      <p>
        Nodaria también sirve para diseñar bases de datos. <strong>Un tipo es una tabla</strong> (o una colección, o una
        etiqueta de un grafo) y <strong>sus atributos son las columnas</strong>. Cada nodo de ese tipo es una tabla: su
        título es el nombre de la tabla. Así una plantilla de tabla, como «Archivo físico», se reutiliza en muchas
        tablas con herencia y preformas.
      </p>

      <h3>Empezar</h3>
      <ol className="guide-steps">
        <li>
          En <strong>Tipos</strong>, abre un tipo y elige su <strong>Base de datos</strong>: SQL Server, Db2 for i (IBM
          i, AS/400), MongoDB, Firestore o Neo4j. Se hereda: si la eliges en un tipo base, todos sus subtipos son tablas
          de esa base.
        </li>
        <li>Añade los atributos: cada uno es una columna. La tarjeta «Columnas SQL» dice su tipo y sus claves.</li>
        <li>Crea un nodo del tipo por cada tabla y ponle de título el nombre de la tabla («Cliente», «Pedido»).</li>
        <li>
          En el <strong>Mapa</strong>, elige la disposición <strong>Base de datos</strong>: los nodos se dibujan como
          tablas, con una fila por columna, y las claves foráneas como líneas de fila a fila.
        </li>
      </ol>
      <p>
        <strong>¿Ya tienes las tablas?</strong> En el menú del proyecto, <strong>Importar tablas (SQL o DDS)</strong>{' '}
        lee el SQL que las crea (los <code>CREATE TABLE</code> de SQL Server o de Db2, también los que genera SQL Server
        Management Studio) o los fuentes DDS de los archivos físicos y lógicos del AS/400. Crea un tipo por tabla, con
        sus columnas, claves, índices, descripciones y claves foráneas, como subtipo del tipo que elijas (por ejemplo,
        «Archivo físico»). Las que ya están en el proyecto no se tocan.
      </p>

      <h3>Columnas («Columnas SQL»)</h3>
      <table className="guide-table guide-terms">
        <tbody>
          <Term name="Tipo SQL">
            Si no eliges ninguno, se deduce del atributo (un texto, <code>nvarchar(50)</code>; un número,{' '}
            <code>int</code>; una fecha, <code>date</code>…). Una referencia a otra tabla toma el tipo de su clave
            primaria.
          </Term>
          <Term name="PK">Clave primaria. Puede ser compuesta: marca varias columnas.</Term>
          <Term name="Nulos · Único · Índice">
            Si admite NULL, si no se puede repetir (UNIQUE) y si lleva un índice. Varias columnas con el mismo{' '}
            <em>grupo único</em> forman una sola UNIQUE compuesta.
          </Term>
          <Term name="IDENTITY">Un número que pone la base sola (1, 2, 3…).</Term>
          <Term name="Por defecto">
            Lo que toma la columna si no se escribe nada, como <code>0</code> o <code>GETDATE()</code>.
          </Term>
          <Term name="Descripción">
            Qué guarda la columna. Sale en el diagrama y en el script (<code>MS_Description</code> en SQL Server,{' '}
            <code>COMMENT ON</code> en Db2).
          </Term>
          <Term name="En la tabla">
            Desmárcalo para que un atributo documente el nodo sin ser columna. El título, los calculados y las
            referencias múltiples no son columnas por defecto.
          </Term>
        </tbody>
      </table>
      <p className="muted-note">
        Una lista de opciones en una columna de texto limita sus valores (<code>CHECK … IN (…)</code>). Cambiar en una
        tabla una preforma o un atributo heredado solo cambia esa tabla y sus subtipos.
      </p>

      <h3>Claves foráneas</h3>
      <p>
        Un atributo de <strong>referencia</strong> hacia un tipo tabla es una clave foránea. En la ficha de cada tabla
        eliges a qué tabla apunta. En «Columnas SQL» decides qué pasa al borrar o actualizar la fila referenciada (NO
        ACTION, CASCADE, SET NULL, SET DEFAULT). Si la tabla destino tiene una clave compuesta, la referencia se abre en
        una columna por cada parte. Una referencia <em>múltiple</em> es una relación muchos a muchos: «Proponer una
        tabla intermedia» la crea por ti.
      </p>
      <p className="muted-note">
        Si escribiste los tipos como texto en los valores de las fichas («varchar(50)», «packed(9,2)»), el botón «Usar
        las anotaciones de las tablas como tipo SQL» de «Columnas SQL» los convierte en tipos de verdad.
      </p>

      <h3>Db2 for i (AS/400)</h3>
      <ul>
        <li>
          Los tipos son los de IBM i: <code>DECIMAL</code> es <strong>packed</strong> (P en DDS) y <code>NUMERIC</code>{' '}
          es <strong>zoned</strong> (S). En una anotación también vale «packed(9,2)» o «zoned(7,0)».
        </li>
        <li>
          Los nombres de más de 10 caracteres llevan también su nombre de sistema (<code>FOR SYSTEM NAME</code>,{' '}
          <code>FOR COLUMN</code>). El nombre de la ficha va como etiqueta (<code>LABEL ON</code>).
        </li>
        <li>
          <strong>Exportar Db2 for i</strong> (en el engranaje o en el menú de exportar del lienzo): eliges la
          biblioteca, <strong>qué tablas se crean</strong> (las demás ya existen en tu sistema) y qué se descarga. Puede
          ser un script único para «Ejecutar scripts SQL» de ACS, los miembros fuente SQL (QSQLSRC) o los DDS (PF y LF
          en QDDSSRC), con su CL. El ZIP trae <code>CARGAR.sql</code> con las órdenes para copiarlos desde el IFS y
          compilar.
        </li>
      </ul>

      <h3>Registros: filas de ejemplo</h3>
      <p>
        En la vista <strong>Registros</strong> (Alt+9, aparece si el proyecto tiene tablas de SQL Server o Db2) cada
        tabla tiene su hoja para escribir filas. Sirven para comprobar que el diseño responde a las preguntas del
        negocio y salen en el script como <code>INSERT</code>.
      </p>
      <ul>
        <li>
          Escribe en la celda. Intro baja a la fila siguiente (en la última crea otra) y Escape deshace lo escrito.
        </li>
        <li>
          <strong>Pega desde Excel o un CSV</strong> con Ctrl+V: rellena hacia la derecha y hacia abajo y crea las filas
          que falten. La coma decimal y las fechas DD/MM/AAAA se entienden.
        </li>
        <li>
          Las claves foráneas se eligen de una lista con las filas de la otra tabla. Las IDENTITY se numeran solas, y
          una celda vacía enseña lo que pondrá la base (<code>auto</code>, <code>= GETDATE()</code>, <code>NULL</code>).
        </li>
        <li>
          Cada celda avisa de lo que la base rechazaría: el tipo, la longitud, los decimales, una obligatoria vacía, una
          clave o un valor único repetidos, un valor fuera de la lista o una clave foránea que no existe. Pasa el ratón
          por encima para ver el motivo.
        </li>
        <li>
          Las filas no se publican con el proyecto ni se envían al asistente de IA. Todo se puede deshacer (Ctrl+Z).
        </li>
      </ul>

      <h3>Consultas</h3>
      <p>
        En «Registros», <strong>Consultas → Nueva</strong> abre un editor SQL que se guarda con su nombre. «Ejecutar» o
        Ctrl+Intro la lanza sobre las filas y el resultado se descarga en CSV. Se ejecuta en tu navegador (SQLite) y
        nunca cambia los datos: solo admite consultas que leen.
      </p>
      <p className="guide-example">
        <code>
          SELECT TOP 10 c.nombre, COUNT(p.id) AS pedidos FROM dbo.Cliente c LEFT JOIN Pedido p ON p.cliente = c.id GROUP
          BY c.nombre
        </code>
        <span>→ cada cliente con su número de pedidos</span>
      </p>
      <p className="muted-note">
        Valen JOIN, GROUP BY, subconsultas y WITH. Se traducen <code>TOP</code>, <code>FETCH FIRST n ROWS ONLY</code>,{' '}
        <code>GETDATE()</code>, <code>CURRENT DATE</code>, <code>ISNULL</code>, <code>LEN</code>, <code>SUBSTRING</code>{' '}
        y los prefijos <code>dbo.</code> y de la biblioteca. Si algo propio de SQL Server o Db2 no funciona, puede que
        en SQLite se llame de otra forma.
      </p>

      <h3>Revisar y exportar</h3>
      <ul>
        <li>
          <strong>Salud</strong> revisa el diseño: tablas sin clave primaria, tipos fuera de rango, claves foráneas que
          no encajan, cascadas imposibles, documentos incrustados sin fin…
        </li>
        <li>
          <strong>Exportar</strong> (engranaje): el script de SQL Server (con las filas de ejemplo antes de las claves
          foráneas), Db2 for i, MongoDB (para mongosh), las reglas de Firestore y el esquema de Neo4j. Cualquier
          proyecto se puede exportar también como grafo a Neo4j.
        </li>
        <li>
          El <strong>asistente de IA</strong> puede proponer tablas y columnas con su tipo y sus claves; tú revisas la
          propuesta antes de aplicarla.
        </li>
      </ul>
    </div>
  );
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <tr>
      <td>
        <strong>{name}</strong>
      </td>
      <td>{children}</td>
    </tr>
  );
}
