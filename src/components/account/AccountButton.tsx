import { CloudOff, CloudAlert, Cloud, LogIn, LogOut, MailWarning, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchMe, OfflineError } from '../../services/api';
import { excludeDeviceFromStats } from '../../services/stats';
import { useAuth, type AccountUser, type AuthStatus } from '../../state/auth';
import { IconButton } from '../common/Button';
import { anchorOf, type Anchor } from '../common/anchor';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { SignInDialog, type SignInMode } from './SignInDialog';
import { SignOutDialog } from './SignOutDialog';
import { useSync } from '../../state/sync';

/** Botón de cuenta de la barra superior: entrar, estado de verificación y menú de la sesión. */
export function AccountButton() {
  const { status, user, getToken } = useAuth();
  const sync = useSync();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
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

  const syncLabel =
    sync.state === 'syncing'
      ? 'Sincronizando…'
      : sync.state === 'offline'
        ? 'Sin conexión con el servidor'
        : sync.state === 'error'
          ? `Error al sincronizar: ${sync.error ?? ''}`
          : 'Proyectos sincronizados';
  const syncHint = sync.lastSyncAt
    ? `Última vez: ${new Date(sync.lastSyncAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : undefined;
  const entries: MenuEntry[] = [
    { section: user?.email ?? 'Cuenta' },
    {
      label: syncLabel,
      hint: syncHint,
      icon: sync.state === 'offline' ? CloudOff : sync.state === 'error' ? CloudAlert : Cloud,
      disabled: true,
      onSelect: () => undefined,
    },
    {
      label: 'Sincronizar ahora',
      icon: RefreshCw,
      disabled: sync.state === 'syncing',
      onSelect: () => void sync.syncNow(),
    },
    'separator',
    { label: 'Cerrar sesión', icon: LogOut, onSelect: () => setSigningOut(true) },
    'separator',
    { label: 'Eliminar cuenta', icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
  ];

  const initial = (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        className={`account-button sync-${sync.state}`}
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
      {signingOut && <SignOutDialog onClose={() => setSigningOut(false)} />}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}

/**
 * Al iniciar sesión, una llamada a /api/me da de alta la cuenta en el servidor y comprueba
 * que la API acepta el token. Un fallo no bloquea nada: la app sigue en local. Si la cuenta es
 * del propietario, marca el dispositivo para que no cuente en las estadísticas.
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
        const me = token ? await fetchMe(token) : null;
        if (me?.excludeFromStats) excludeDeviceFromStats();
      } catch (error) {
        if (error instanceof OfflineError) toast({ message: 'Sin conexión con el servidor de Nodaria.' });
        else if (error instanceof ApiError) toast({ message: `No se pudo conectar la cuenta: ${error.message}` });
      }
    })();
  }, [status, user, getToken, toast]);
}
