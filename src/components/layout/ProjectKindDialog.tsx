import { useState } from 'react';
import { PROJECT_KINDS } from '../../domain/projectKinds';
import type { ProjectKind } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';

/** Tipo del proyecto: adapta los ejemplos de la interfaz (fórmulas, placeholders, ayudas) a su tema. */
export function ProjectKindDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const [kind, setKind] = useState<ProjectKind>(project.kind);
  return (
    <Modal
      title="Tipo de proyecto"
      submitLabel="Aplicar"
      submitDisabled={kind === project.kind}
      onClose={onClose}
      onSubmit={() => {
        dispatch({ type: 'set-project-kind', kind });
        onClose();
      }}
    >
      <p className="muted-note">
        Adapta los ejemplos y las ayudas de la web al tema del proyecto, como la guía de fórmulas o los nombres de
        ejemplo al crear tipos. No cambia tus datos.
      </p>
      <fieldset className="choice-group">
        <legend>¿De qué trata «{project.name}»?</legend>
        {PROJECT_KINDS.map(k => (
          <label key={k.id}>
            <input type="radio" name="project-kind" checked={kind === k.id} onChange={() => setKind(k.id)} />
            <span>
              <strong>{k.label}</strong> <span className="field-hint">{k.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}
