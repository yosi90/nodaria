import { Modal } from '../common/Modal';
import { FormulasGuide } from './FormulasGuide';
import { ShortcutsContent } from './ShortcutsHelp';
import type { HelpTopic } from '../../state/navigation';
import { useTour } from '../../state/tour';
import { Button } from '../common/Button';
import { LegalLinks } from '../common/LegalLinks';
import { Compass, Layers, Lightbulb } from 'lucide-react';
import { useRequests } from '../../state/requests';

const TOPICS: { id: HelpTopic; label: string }[] = [
  { id: 'start', label: 'Primeros pasos' },
  { id: 'shortcuts', label: 'Atajos de teclado' },
  { id: 'formulas', label: 'Fórmulas' },
];

/** Ayuda de la aplicación: atajos y guía de fórmulas, en pestañas. */
export function HelpDialog({
  topic,
  onTopic,
  onClose,
  onTemplates,
}: {
  topic: HelpTopic;
  onTopic: (topic: HelpTopic) => void;
  onClose: () => void;
  onTemplates: () => void;
}) {
  const { start } = useTour();
  const requests = useRequests();
  return (
    <Modal title="Ayuda" informational wide onClose={onClose}>
      <div className="segmented help-tabs" role="tablist" aria-label="Temas de ayuda">
        {TOPICS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={topic === t.id} onClick={() => onTopic(t.id)}>
            <span className="label">{t.label}</span>
          </button>
        ))}
      </div>
      {topic === 'start' ? (
        <div className="guide">
          <p>
            Nodaria se usa en tres pasos: define en <strong>Tipos</strong> qué clases de cosas existen y qué atributos
            tienen; define en <strong>Relaciones</strong> cómo se conectan; crea después los nodos en el{' '}
            <strong>Mapa</strong> o en la <strong>Tabla</strong>. <strong>Salud</strong> te dice qué falta.
          </p>
          <h3>Conceptos clave</h3>
          <p>
            <strong>Estructura.</strong> Los nodos forman un árbol («Dentro de»): una marca contiene sus modelos. Un
            tipo decide qué puede contener. Una relación marcada como estructural sirve de jerarquía alternativa en «Ver
            por».
          </p>
          <p>
            <strong>Atributo de referencia o relación.</strong> Una referencia es un dato del nodo («Abogado: Pablo») y
            se dibuja como vínculo discontinuo. Una relación es una cosa en sí, con sus propios atributos (importe,
            fecha) y nombre en cada sentido. Si necesitas describir el vínculo, es una relación.
          </p>
          <p>
            <strong>Preforma.</strong> Un atributo definido una vez en «Propiedades» y vinculado a varios tipos. Los
            valores no cambian al compartirlo o desvincularlo.
          </p>
          <p>
            <strong>Herencia.</strong> Un tipo puede heredar de otro: recibe sus atributos, sus subnodos permitidos y
            cuenta como él en las restricciones de relación. Un tipo abstracto solo sirve de base.
          </p>
          <p>
            <strong>Parentesco.</strong> Una relación genealógica elige un término del vocabulario (progenitor, pareja…)
            y lo nombra según el género de cada nodo: «Padre», «Hija». De ahí salen el árbol y la disposición
            «Genealogía».
          </p>
          <div className="guide-actions">
            <Button
              variant="primary"
              icon={Compass}
              onClick={() => {
                onClose();
                window.setTimeout(start, 150);
              }}
            >
              Lanzar el recorrido guiado
            </Button>
            <Button
              icon={Layers}
              onClick={() => {
                onClose();
                onTemplates();
              }}
            >
              Ejemplos y plantillas
            </Button>
            <Button
              icon={Lightbulb}
              onClick={() => {
                onClose();
                requests.open('new');
              }}
            >
              Proponer una idea o avisar de un error
            </Button>
          </div>
          <small>
            El recorrido señala las partes de la pantalla sobre el proyecto abierto; está pensado para «Ejemplo:
            Coches», que puedes abrir desde «Ejemplos y plantillas».
          </small>
        </div>
      ) : topic === 'shortcuts' ? (
        <ShortcutsContent />
      ) : (
        <FormulasGuide />
      )}
      <LegalLinks />
    </Modal>
  );
}
