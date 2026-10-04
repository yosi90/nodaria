import { LogIn, LogOut, MailWarning, Trash2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchMe, OfflineError } from '../../services/api';
import { useAuth, type AccountUser, type AuthStatus } from '../../state/auth';
import { IconButton } from '../common/Button';
import { anchorOf, type Anchor } from '../common/anchor';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { SignInDialog, type SignInMode } from './SignInDialog';

/** Botón de cuenta de la barra superior: entrar, estado de verificación y menú de la sesión. */
export function AccountButton() {
  const { status, user, getToken, signOut } = useAuth();
  const toast = useToast();
  const [signIn, setSignIn] = useState<SignInMode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  useRegisterWithApi(status, user, getToken, toast);

  if (status === 'loading') return <span className="account-slot" aria-hidden />;

  if (status === 'signed-out') {
    return (
      <>
        <IconButton icon={LogIn} label="Iniciar sesión" onClick={() => setSignIn('login')} />
        {signIn && <SignInDialog initialMode={signIn} onClose={() => setSignIn(null)} />}
      </>
    );
  }

  if (status === 'unverified') {
    return (
      <>
        <IconButton
          icon={MailWarning}
          label="Confirma tu correo para activar la cuenta"
          className="account-unverified"
          onClick={() => setSignIn('verify')}
        />
        {signIn && <SignInDialog initialMode={signIn} onClose={() => setSignIn(null)} />}
      </>
    );
  }

  const entries: MenuEntry[] = [
    { section: user?.email ?? 'Cuenta' },
    {
      label: 'Cerrar sesión',
      icon: LogOut,
      onSelect: () => {
        void signOut().then(() => toast({ message: 'Sesión cerrada. Los proyectos siguen en este navegador.' }));
      },
    },
    'separator',
    { label: 'Eliminar cuenta', icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
  ];

  const initial = (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAnchor)}
        aria-label={`Cuenta: ${user?.email ?? ''}`}
        data-tooltip={user?.email ?? 'Cuenta'}
        data-tooltip-side="left"
        onClick={event => (menuAnchor ? closeMenu() : setMenuAnchor(anchorOf(event.currentTarget)))}
      >
        {user?.photoUrl ? (
          <img src={user.photoUrl} alt="" referrerPolicy="no-referrer" />
        ) : initial !== '?' ? (
          <span>{initial}</span>
        ) : (
          <UserRound size={16} aria-hidden />
        )}
      </button>
      {menuAnchor && <Menu anchor={menuAnchor} entries={entries} onClose={closeMenu} label="Cuenta" />}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}

/**
 * Al iniciar sesión, una llamada a /api/me da de alta la cuenta en el servidor y comprueba
 * que la API acepta el token. Un fallo no bloquea nada: la app sigue en local.
 */
function useRegisterWithApi(
  status: AuthStatus,
  user: AccountUser | null,
  getToken: (forceRefresh?: boolean) => Promise<string | null>,
  toast: (options: { message: string }) => void,
) {
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'signed-in' || !user || announced.current === user.uid) return;
    announced.current = user.uid;
    void (async () => {
      try {
        const token = await getToken();
        if (token) await fetchMe(token);
      } catch (error) {
        if (error instanceof OfflineError) toast({ message: 'Sin conexión con el servidor de Nodaria.' });
        else if (error instanceof ApiError) toast({ message: `No se pudo conectar la cuenta: ${error.message}` });
      }
    })();
  }, [status, user, getToken, toast]);
}
