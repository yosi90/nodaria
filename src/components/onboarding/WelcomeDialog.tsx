import { Compass, FolderSearch, Layers, PenLine } from 'lucide-react';
import { templateById } from '../../domain/templates';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { useTour } from '../../state/tour';
import { Logo } from '../common/Logo';
import { Modal } from '../common/Modal';

/*
 * Bienvenida de la primera visita: explica en dos frases qué es Nodaria y ofrece cuatro caminos.
 * Solo aparece cuando no hay datos todavía; después se puede volver a los ejemplos desde el menú
 * del proyecto o desde la ayuda.
 */

export function WelcomeDialog({ onClose, onTemplates }: { onClose: () => void; onTemplates: () => void }) {
  const { dispatch } = useApp();
  const { setView } = useNavigation();
  const { start } = useTour();

  const openExample = (id: string, withTour: boolean) => {
    const template = templateById(id);
    if (!template) return;
    dispatch({ type: 'import-project', project: template.build(), replaceBlank: true });
    setView('map');
    onClose();
    if (withTour) window.setTimeout(start, 250);
  };

  return (
    <Modal title="Bienvenido a Nodaria" informational wide onClose={onClose}>
      <div className="welcome">
        <div className="welcome-brand" aria-hidden>
          <Logo size={34} />
        </div>
        <p className="welcome-lead">
          Nodaria es un mapa de nodos y relaciones con esquema propio: primero defines qué tipos de cosas existen y cómo
          se conectan, y después creas los nodos. Sirve para planificar una novela, documentar una investigación o
          entender cualquier conjunto de piezas enlazadas.
        </p>
        <div className="welcome-options">
          <button type="button" className="welcome-option primary" onClick={() => openExample('cars', true)}>
            <Compass size={20} aria-hidden />
            <span>
              <strong>Recorrido guiado</strong>
              <small>Diez pasos sobre un ejemplo pequeño de coches. Cinco minutos.</small>
            </span>
          </button>
          <button type="button" className="welcome-option" onClick={() => openExample('puerto-norte', false)}>
            <FolderSearch size={20} aria-hidden />
            <span>
              <strong>Ver un caso complejo</strong>
              <small>«Caso Puerto Norte»: una investigación con herencia, familias, pagos y documentos.</small>
            </span>
          </button>
          <button
            type="button"
            className="welcome-option"
            onClick={() => {
              onClose();
              onTemplates();
            }}
          >
            <Layers size={20} aria-hidden />
            <span>
              <strong>Empezar con una plantilla</strong>
              <small>Mundo de fantasía, novela o un proyecto vacío.</small>
            </span>
          </button>
          <button type="button" className="welcome-option" onClick={onClose}>
            <PenLine size={20} aria-hidden />
            <span>
              <strong>Explorar por mi cuenta</strong>
              <small>Empiezas en blanco. La ayuda está en el botón «?».</small>
            </span>
          </button>
        </div>
        <p className="welcome-note">
          Los ejemplos se guardan como proyectos tuyos: puedes modificarlos, borrarlos o usarlos de base.
        </p>
      </div>
    </Modal>
  );
}
