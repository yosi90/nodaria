import { useRef, useState } from 'react';
import { TEMPLATES, templateById } from '../../domain/templates';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';

/** La plantilla establece un punto de partida editable; el proyecto sigue siendo generalista. */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { dispatch } = useApp();
  const { setView } = useNavigation();
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('empty');
  const nameInput = useRef<HTMLInputElement>(null);
  const template = templateById(templateId)!;
  return (
    <Modal
      title="Nuevo proyecto"
      submitLabel="Crear proyecto"
      submitDisabled={!name.trim()}
      initialFocus={nameInput}
      onClose={onClose}
      onSubmit={() => {
        dispatch({ type: 'import-project', project: { ...template.build(), name: name.trim() }, replaceBlank: true });
        setView('map');
        onClose();
      }}
    >
      <div className="form-grid">
        <label className="field">
          Nombre
          <input
            ref={nameInput}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Por ejemplo: Mi próximo proyecto"
          />
        </label>
        <div className="field">
          Plantilla de proyecto
          <Select
            aria-label="Plantilla de proyecto"
            options={TEMPLATES.filter(t => t.kind === 'template').map(t => ({ value: t.id, label: t.name }))}
            value={templateId}
            onChange={id => id && setTemplateId(id)}
          />
          <small>{template.summary} Puedes cambiar todos sus tipos y atributos después.</small>
        </div>
      </div>
    </Modal>
  );
}
