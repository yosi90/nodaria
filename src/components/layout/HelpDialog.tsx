import { Modal } from '../common/Modal';
import { FormulasGuide } from './FormulasGuide';
import { ShortcutsContent } from './ShortcutsHelp';
import type { HelpTopic } from '../../state/navigation';

const TOPICS: { id: HelpTopic; label: string }[] = [
  { id: 'shortcuts', label: 'Atajos de teclado' },
  { id: 'formulas', label: 'Fórmulas' },
];

/** Ayuda de la aplicación: atajos y guía de fórmulas, en pestañas. */
export function HelpDialog({
  topic,
  onTopic,
  onClose,
}: {
  topic: HelpTopic;
  onTopic: (topic: HelpTopic) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Ayuda" informational wide onClose={onClose}>
      <div className="segmented help-tabs" role="tablist" aria-label="Temas de ayuda">
        {TOPICS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={topic === t.id} onClick={() => onTopic(t.id)}>
            <span className="label">{t.label}</span>
          </button>
        ))}
      </div>
      {topic === 'shortcuts' ? <ShortcutsContent /> : <FormulasGuide />}
    </Modal>
  );
}
