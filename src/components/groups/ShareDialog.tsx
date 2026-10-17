import { useRef, useState } from 'react';
import { GROUP_NAME_MAX, groupErrorMessage, type GroupInfo } from '../../services/groups';
import { useApp } from '../../state/AppContext';
import { useGroups } from '../../state/groups';
import { Modal } from '../common/Modal';

/**
 * Compartir el proyecto abierto: crea un grupo de trabajo (un espacio de la plataforma) con él. El
 * proyecto pasa a ser del grupo; después se invita a las personas desde el diálogo del grupo.
 */
export function ShareDialog({ onClose, onShared }: { onClose: () => void; onShared: (group: GroupInfo) => void }) {
  const { project } = useApp();
  const { share } = useGroups();
  // El nombre del grupo admite menos que el de un proyecto: se propone el del proyecto, recortado.
  const [name, setName] = useState(project.name.slice(0, GROUP_NAME_MAX));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onShared(await share(project, name.trim()));
    } catch (failure) {
      setError(groupErrorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Compartir con un grupo"
      submitLabel={busy ? 'Creando el grupo…' : 'Crear el grupo'}
      submitDisabled={busy || !name.trim()}
      initialFocus={input}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <div className="form-grid">
        <p className="muted-note">
          «{project.name}» pasará a ser el proyecto de un grupo de trabajo: lo verán y cambiarán las personas que
          invites, según su rol. Deja de ser solo tuyo; tú tendrás la propiedad del grupo.
        </p>
        <label className="field">
          Nombre del grupo
          <input ref={input} value={name} maxLength={GROUP_NAME_MAX} onChange={e => setName(e.target.value)} />
          <small>Lo ven los miembros y aparece en sus invitaciones.</small>
        </label>
        {error && (
          <p className="group-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
