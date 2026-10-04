import { useState, type FormEvent } from 'react';
import {
  getAuthErrorMessage,
  registerWithEmail,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from '../../services/firebase';
import { useAuth } from '../../state/auth';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

export type SignInMode = 'login' | 'register' | 'reset' | 'verify';

const TITLES: Record<SignInMode, string> = {
  login: 'Iniciar sesión',
  register: 'Crear cuenta',
  reset: 'Recuperar contraseña',
  verify: 'Confirma tu correo',
};

const SUBMIT: Record<SignInMode, string> = {
  login: 'Entrar',
  register: 'Crear cuenta',
  reset: 'Enviar enlace',
  verify: 'Ya lo he verificado',
};

/** Acceso con correo y contraseña o con Google; registro con verificación y recuperación de contraseña. */
export function SignInDialog({ initialMode = 'login', onClose }: { initialMode?: SignInMode; onClose: () => void }) {
  const { user, recheckVerification, signOut } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<SignInMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: SignInMode) => {
    setMode(next);
    setError(null);
  };

  const submit = () =>
    run(async () => {
      if (mode === 'login') {
        await signInWithEmail(email, password);
        toast({ message: 'Sesión iniciada' });
        onClose();
      } else if (mode === 'register') {
        await registerWithEmail(email, password);
        switchTo('verify');
      } else if (mode === 'reset') {
        await sendPasswordReset(email);
        toast({ message: 'Te hemos enviado un correo para cambiar la contraseña' });
        switchTo('login');
      } else {
        const verified = await recheckVerification();
        if (verified) {
          toast({ message: 'Correo verificado. Sesión iniciada' });
          onClose();
        } else {
          setError('Todavía no consta como verificado. Abre el enlace del correo y vuelve a probar.');
        }
      }
    });

  const google = () =>
    run(async () => {
      await signInWithGoogle();
      toast({ message: 'Sesión iniciada con Google' });
      onClose();
    });

  const resend = () => run(() => resendVerificationEmail().then(() => toast({ message: 'Correo reenviado' })));

  const emailValid = /\S+@\S+\.\S+/.test(email);
  const canSubmit =
    mode === 'verify' ||
    (mode === 'reset' && emailValid) ||
    ((mode === 'login' || mode === 'register') && emailValid && password.length >= 6);

  const onGoogleClick = (event: FormEvent) => {
    event.preventDefault();
    void google();
  };

  return (
    <Modal
      title={TITLES[mode]}
      submitLabel={SUBMIT[mode]}
      submitDisabled={busy || !canSubmit}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <div className="auth-form">
        {mode === 'verify' ? (
          <>
            <p className="muted-note">
              Hemos enviado un enlace de confirmación a <strong>{user?.email ?? email}</strong>. Ábrelo y después pulsa
              «Ya lo he verificado». Mientras tanto, la aplicación sigue funcionando en local.
            </p>
            <div className="auth-links">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void resend()}>
                Reenviar el correo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void signOut().then(() => switchTo('login'))}
              >
                Usar otra cuenta
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="muted-note">
              {mode === 'register'
                ? 'Con una cuenta podrás guardar tus proyectos en la nube y abrirlos desde otros dispositivos. Es opcional: sin cuenta todo sigue en este navegador.'
                : mode === 'reset'
                  ? 'Te enviaremos un enlace para elegir una contraseña nueva.'
                  : 'Entra para sincronizar tus proyectos entre dispositivos. Sin cuenta, todo sigue guardándose en este navegador.'}
            </p>
            <label className="field">
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>
            {mode !== 'reset' && (
              <label className="field">
                Contraseña
                <input
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={busy}
                />
                {mode === 'register' && <small>Al menos 6 caracteres.</small>}
              </label>
            )}
            {mode !== 'reset' && (
              <>
                <div className="auth-divider" aria-hidden>
                  <span>o</span>
                </div>
                <Button block disabled={busy} onClick={onGoogleClick}>
                  <GoogleMark />
                  Continuar con Google
                </Button>
              </>
            )}
            <div className="auth-links">
              {mode === 'login' && (
                <>
                  <button type="button" className="link-button" onClick={() => switchTo('register')}>
                    Crear una cuenta
                  </button>
                  <button type="button" className="link-button" onClick={() => switchTo('reset')}>
                    He olvidado la contraseña
                  </button>
                </>
              )}
              {mode !== 'login' && (
                <button type="button" className="link-button" onClick={() => switchTo('login')}>
                  Ya tengo cuenta
                </button>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="validation-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
