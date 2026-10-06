import { useState } from 'react';
import { clearBackups } from '../../services/storage';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useSync } from '../../state/sync';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/** Cierra la sesión; opcionalmente vacía los proyectos de este navegador (útil en equipos compartidos). */
export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();
  const { forgetAccount, state } = useSync();
  const { dispatch } = useApp();
  const toast = useToast();
  const [wipe, setWipe] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await signOut();
      forgetAccount();
      if (wipe) {
        dispatch({ type: 'reset-state' });
        await clearBackups().catch(() => undefined);
      }
      toast({
        message: wipe
          ? 'Sesión cerrada y navegador vaciado'
          : 'Sesión cerrada. Los proyectos siguen en este navegador.',
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Cerrar sesión"
      submitLabel="Cerrar sesión"
      submitDisabled={busy}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <div className="auth-form">
        <p className="muted-note" style={{ color: 'var(--text)' }}>
          Tus proyectos están guardados en la cuenta
          {state === 'idle'
            ? '.'
            : state === 'syncing'
              ? ' (sincronizando ahora mismo).'
              : ' hasta la última sincronización correcta.'}
        </p>
        <label className="check">
          <input type="checkbox" checked={wipe} onChange={event => setWipe(event.target.checked)} />
          Quitar los proyectos de este navegador
        </label>
        <p className="muted-note">
          Márcalo en un equipo compartido. Si lo dejas sin marcar, los proyectos siguen aquí y podrás seguir trabajando
          sin cuenta.
        </p>
      </div>
    </Modal>
  );
}
