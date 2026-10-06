/** Guía de los campos calculados: qué expresiones admite una fórmula y cómo usarlas. */
export function FormulasGuide() {
  return (
    <div className="guide">
      <p>
        Un atributo de tipo <strong>Calculado</strong> no se escribe a mano: su valor sale de una <em>fórmula</em>. La
        fórmula es texto libre con expresiones entre llaves; cada expresión se sustituye por el dato que nombra y el
        resto se copia tal cual. El resultado se ve en la ficha, en la Tabla y, si el atributo tiene «Mostrar en el
        nodo», en la tarjeta del lienzo.
      </p>
      <p className="guide-example">
        <code>{'{nombre}, {edad} años. Vive en {padre} y venera a {dios}.'}</code>
        <span>→ Aria, 30 años. Vive en Vael y venera a Solenne.</span>
      </p>

      <h3>Atributos del propio nodo</h3>
      <table className="guide-table">
        <tbody>
          <Row
            expr="{clave}"
            text="El valor de un atributo. Vale la clave o la etiqueta del atributo, sin distinguir mayúsculas ni acentos."
          />
          <Row expr="{titulo}" text="El título del nodo (su atributo marcado como título)." />
          <Row expr="{tipo}" text="El nombre de su tipo («Personaje»)." />
        </tbody>
      </table>
      <p className="muted-note">
        Una referencia se muestra con el título del nodo referido; una lista o unas referencias múltiples, con sus
        elementos separados por comas; un sí/no, como «Sí» o «No»; una escala, con su número.
      </p>

      <h3>Seguir una referencia</h3>
      <table className="guide-table">
        <tbody>
          <Row
            expr="{referencia.clave}"
            text="Un atributo del nodo al que apunta una referencia: {dios.dominio} lee «dominio» en el dios patrón."
          />
          <Row
            expr="{referencias.clave}"
            text="Con referencias múltiples, el atributo de cada nodo referido, separados por comas."
          />
          <Row expr="{padre}" text="El título del nodo superior en la jerarquía «Dentro de»." />
          <Row expr="{padre.clave}" text="Un atributo de ese nodo superior ({padre.region})." />
        </tbody>
      </table>

      <h3>Contar y listar</h3>
      <table className="guide-table">
        <tbody>
          <Row expr="{contar(relaciones)}" text="Cuántas relaciones tiene el nodo, en cualquier sentido." />
          <Row expr="{contar(relaciones:Amistad)}" text="Solo las de ese tipo de relación, por su nombre." />
          <Row expr="{contar(hijos)}" text="Cuántos subnodos tiene en «Dentro de»." />
          <Row
            expr="{contar(clave)}"
            text="Cuántos elementos tiene una lista de etiquetas o unas referencias múltiples."
          />
          <Row
            expr="{lista(relaciones)}"
            text="Los títulos de los nodos con los que se relaciona, separados por comas."
          />
          <Row expr="{lista(relaciones:Amistad)}" text="Solo los de ese tipo de relación." />
          <Row expr="{lista(hijos)}" text="Los títulos de sus subnodos." />
        </tbody>
      </table>

      <h3>Fechas y edades</h3>
      <p className="muted-note">
        Las fechas usan el <strong>calendario del mundo</strong> (ajustes del proyecto, el engranaje junto a su nombre →
        «Calendario del mundo…»): sus meses, sus días de la semana y su fecha actual. Un atributo de fecha se lee «3 de
        Brumal de 1043».
      </p>
      <table className="guide-table">
        <tbody>
          <Row expr="{edad(nacimiento)}" text="Años cumplidos desde esa fecha hasta la fecha actual del mundo." />
          <Row expr="{edad(nacimiento, muerte)}" text="Años entre dos fechas: la edad a la que murió." />
          <Row expr="{dias(inicio, fin)}" text="Días entre dos fechas; con una sola, hasta hoy." />
          <Row expr="{diasemana(fecha)}" text="El nombre del día de la semana de esa fecha." />
          <Row expr="{hoy}" text="La fecha actual del mundo; {hoy.anio} solo el año." />
          <Row
            expr="{fecha.dia} {fecha.mes} {fecha.anio}"
            text="Partes de una fecha: el día, el nombre del mes o el año. También {fecha.diasemana}."
          />
          <Row
            expr="{edad(padre.nacimiento)}"
            text="Los argumentos pueden seguir una referencia o «padre», ser «hoy» o una fecha literal AAAA-MM-DD."
          />
        </tbody>
      </table>

      <h3>Buenas prácticas</h3>
      <ul>
        <li>
          Un calculado puede usar otro calculado (<code>{'{ficha} · {contar(relaciones)} relaciones'}</code>). Si dos se
          citan entre sí, el bucle se corta solo y el resultado queda incompleto.
        </li>
        <li>Una expresión que no se reconoce se sustituye por nada: revisa la clave si el valor sale vacío.</li>
        <li>
          Las claves se eligen al crear el atributo; aparecen bajo su nombre en el editor de tipos. Si cambias una
          clave, actualiza las fórmulas que la usen.
        </li>
        <li>Los calculados son de solo lectura y no se guardan: se recalculan cada vez con los datos actuales.</li>
      </ul>

      <h3>Ejemplos</h3>
      <table className="guide-table">
        <tbody>
          <Row expr="{nombre} ({edad(nacimiento)})" text="Nombre y edad en una línea para la tarjeta." />
          <Row expr="{contar(relaciones:Enemistad)} enemigos" text="Cuántos enemigos declarados tiene un personaje." />
          <Row
            expr="Hijos: {lista(relaciones:Progenitor)}"
            text="Los descendientes directos según una relación «Progenitor»."
          />
          <Row expr="{padre.tipo}: {padre}" text="«Reino: Vael» en un lugar que cuelga de un reino." />
          <Row expr="{dios.dominio} · {escuela.disciplina}" text="Rasgos de dos nodos referidos, uno junto a otro." />
        </tbody>
      </table>
    </div>
  );
}

function Row({ expr, text }: { expr: string; text: string }) {
  return (
    <tr>
      <td>
        <code>{expr}</code>
      </td>
      <td>{text}</td>
    </tr>
  );
}
