import {
  Cloud,
  CloudAlert,
  CloudOff,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundPen,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteMe } from '../../services/api';
import { SOCIAL_URL, sdk } from '../../services/yosiftware';
import { useAuth } from '../../state/auth';
import { useSync } from '../../state/sync';
import { IconButton } from '../common/Button';
import { anchorOf, type Anchor } from '../common/anchor';
import { useDialogs } from '../common/dialogs';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { SignOutDialog } from './SignOutDialog';

/**
 * Cuenta de Yosiftware en la barra superior. Entrar, el perfil, la privacidad y salir son del SDK de
 * la plataforma; aquí solo está el estado de la sincronización y borrar los datos de Nodaria.
 */
export function AccountButton() {
  const { status, user, restrictions, signIn, getToken } = useAuth();
  const sync = useSync();
  const toast = useToast();
  const { confirm } = useDialogs();
  const [signingOut, setSigningOut] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const [photo, setPhoto] = useState<{ account: string; url: string | null } | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  // La foto viene del perfil común de la plataforma; Nodaria no guarda nada de él.
  const account = status === 'signed-in' ? (user?.id ?? null) : null;
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void sdk()
      ?.perfil()
      .then(profile => !cancelled && setPhoto({ account, url: profile?.avatar?.miniatura ?? null }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [account]);
  const avatar = photo && photo.account === account ? photo.url : null;

  if (status === 'loading') return <span className="account-slot" aria-hidden />;

  if (status === 'unavailable') {
    return (
      <IconButton
        icon={CloudOff}
        label="La cuenta de Yosiftware no responde ahora. Nodaria sigue funcionando en este navegador."
        tooltipSide="left"
        disabled
      />
    );
  }

  if (status === 'signed-out') {
    return (
      <IconButton
        icon={LogIn}
        label="Entrar con tu cuenta de Yosiftware (opcional: sincroniza tus proyectos)"
        tooltipSide="left"
        onClick={() => void signIn()}
      />
    );
  }

  const deleteData = async () => {
    const ok = await confirm({
      title: 'Borrar tus datos de Nodaria',
      message:
        'Se borran del servidor los proyectos guardados en tu cuenta. Los de este navegador se quedan aquí y tu cuenta de Yosiftware sigue igual. Para borrar la cuenta entera, ve a tu cuenta en la web social.',
      confirmLabel: 'Borrar mis datos de Nodaria',
      danger: true,
    });
    if (!ok) return;
    try {
      const token = await getToken();
      if (!token) return;
      await deleteMe(token);
      sync.forgetAccount();
      await sdk()?.salir();
      toast({ message: 'Datos de Nodaria borrados del servidor. Los proyectos de este navegador siguen aquí.' });
    } catch (error) {
      toast({ message: `No se pudieron borrar: ${error instanceof ApiError ? error.message : 'sin conexión'}` });
    }
  };

  const limited = restrictions?.scopes.includes('creacion');
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
    { section: user?.alias ?? 'Cuenta' },
    {
      label: syncLabel,
      hint: syncHint,
      icon: sync.state === 'offline' ? CloudOff : sync.state === 'error' ? CloudAlert : Cloud,
      disabled: true,
      onSelect: () => undefined,
    },
    ...(limited
      ? [
          {
            label: 'Los proyectos nuevos se quedan en este navegador',
            hint: restrictions?.until
              ? `Tu cuenta tiene limitado crear contenido hasta el ${new Date(restrictions.until).toLocaleDateString('es')}`
              : 'Tu cuenta tiene limitado crear contenido',
            icon: CloudAlert,
            disabled: true,
            onSelect: () => undefined,
          } satisfies MenuEntry,
        ]
      : []),
    {
      label: 'Sincronizar ahora',
      icon: RefreshCw,
      disabled: sync.state === 'syncing',
      onSelect: () => void sync.syncNow(),
    },
    'separator',
    { label: 'Mi perfil', icon: UserRoundPen, onSelect: () => void sdk()?.editarPerfil() },
    { label: 'Privacidad', icon: ShieldCheck, onSelect: () => void sdk()?.privacidad() },
    {
      label: 'Tu cuenta en Yosiftware',
      hint: 'social.yosiftware.es',
      icon: ExternalLink,
      onSelect: () => window.open(SOCIAL_URL, '_blank', 'noopener'),
    },
    'separator',
    { label: 'Cerrar sesión', icon: LogOut, onSelect: () => setSigningOut(true) },
    'separator',
    { label: 'Borrar mis datos de Nodaria', icon: Trash2, danger: true, onSelect: () => void deleteData() },
  ];

  const initial = (user?.alias || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <button
        type="button"
        className={`account-button sync-${sync.state}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAnchor)}
        aria-label={`Cuenta: ${user?.alias ?? ''}`}
        data-tooltip={user?.alias ?? 'Cuenta'}
        data-tooltip-side="left"
        onClick={event => (menuAnchor ? closeMenu() : setMenuAnchor(anchorOf(event.currentTarget)))}
      >
        {avatar ? (
          <img src={avatar} alt="" />
        ) : initial !== '?' ? (
          <span>{initial}</span>
        ) : (
          <UserRound size={16} aria-hidden />
        )}
        <span className="account-sync-dot" aria-hidden />
      </button>
      {menuAnchor && <Menu anchor={menuAnchor} entries={entries} onClose={closeMenu} label="Cuenta" />}
      {signingOut && <SignOutDialog onClose={() => setSigningOut(false)} />}
    </>
  );
}
