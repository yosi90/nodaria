import { useState } from 'react';
import { ApiError, deleteMe } from '../../services/api';
import { getAuthErrorMessage, reauthenticate } from '../../services/firebase';
import { useAuth } from '../../state/auth';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/**
 * Borra la cuenta en la API (datos en el servidor y cuenta de Firebase). Reautentica antes
 * porque la API exige un inicio de sesión reciente; los proyectos de este navegador no se tocan.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, getToken, signOut } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsPassword = Boolean(user?.hasPassword);
  const canSubmit = confirmation.trim().toUpperCase() === 'ELIMINAR' && (!needsPassword || password.length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await reauthenticate(needsPassword ? password : undefined);
      const token = await getToken(true);
      if (!token) throw new Error('No hay sesión iniciada.');
      await deleteMe(token);
      await signOut();
      toast({ message: 'Cuenta eliminada. Los proyectos de este navegador se conservan.' });
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : getAuthErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Eliminar cuenta"
      submitLabel="Eliminar cuenta"
      tone="danger"
      submitDisabled={busy || !canSubmit}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <div className="auth-form">
        <p className="muted-note" style={{ color: 'var(--text)' }}>
          Se borrarán la cuenta <strong>{user?.email}</strong> y todos los proyectos guardados en el servidor. Los
          proyectos de este navegador no se tocan. Esta acción no se puede deshacer.
        </p>
        {needsPassword ? (
          <label className="field">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>
        ) : (
          <p className="muted-note">Se abrirá la ventana de Google para confirmar tu identidad.</p>
        )}
        <label className="field">
          Escribe ELIMINAR para confirmar
          <input
            autoFocus={!needsPassword}
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="validation-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
