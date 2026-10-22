import { useState } from 'react';
import { useAuth } from '../../state/auth';
import { useSync } from '../../state/sync';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/**
 * Cierra la sesión de Yosiftware (en todas sus webs). Antes sube lo pendiente; al cerrarse, el motor
 * de sincronización retira del navegador los proyectos de la cuenta y aparta los cambios que no se
 * hayan podido subir hasta que vuelva a entrar (`state/sync.tsx`).
 */
export function SignOutDialog({ onClose, all = false }: { onClose: () => void; all?: boolean }) {
  const { signOut, signOutAll } = useAuth();
  const { markLeaving, syncNow, state } = useSync();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await syncNow().catch(() => undefined);
      markLeaving();
      await (all ? signOutAll() : signOut());
      toast({ message: 'Sesión cerrada. Tus proyectos siguen en tu cuenta y se han quitado de este navegador.' });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={all ? 'Cerrar sesión en todas las cuentas' : 'Cerrar sesión'}
      submitLabel="Cerrar sesión"
      submitDisabled={busy}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <div className="auth-form">
        <p className="muted-note" style={{ color: 'var(--text)' }}>
          {all
            ? 'Se cierran todas las cuentas guardadas en este navegador, en todas las webs de Yosiftware, y los proyectos de tu cuenta se quitan de aquí.'
            : 'Se cierra la sesión de esta cuenta en todas las webs de Yosiftware (las demás cuentas guardadas siguen) y sus proyectos se quitan de este navegador.'}
          Siguen guardados en tu cuenta
          {state === 'idle'
            ? '.'
            : state === 'syncing'
              ? ' (sincronizando ahora mismo).'
              : ' hasta la última sincronización correcta.'}
        </p>
        <p className="muted-note">
          Si algo no se ha podido subir, se guarda aparte en este navegador, sin enseñarse, hasta que vuelvas a entrar
          con esta cuenta.
        </p>
      </div>
    </Modal>
  );
}
