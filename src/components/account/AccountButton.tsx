import {
  Cloud,
  CloudAlert,
  CloudOff,
  LogOut,
  MailOpen,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundPen,
  UserRoundPlus,
  Globe,
} from 'lucide-react';
import { openCommunity } from '../community/openCommunity';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, deleteMe } from '../../services/api';
import { SOCIAL_URL, sdk, type SavedAccount } from '../../services/yosiftware';
import { useAuth } from '../../state/auth';
import { useSync } from '../../state/sync';
import { IconButton } from '../common/Button';
import { anchorOf, type Anchor } from '../common/anchor';
import { useDialogs } from '../common/dialogs';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { YosiSymbol } from '../common/YosiSymbol';
import { SignOutDialog } from './SignOutDialog';

/**
 * Cuenta de Yosiftware en la barra superior, con su panel de cuentas propio (`ecosistema-kit/ACCESO.md`,
 * «El panel de cuentas»): las otras cuentas guardadas en el navegador, añadir otra, salir de esta o de
 * todas, y «Gestionar tu cuenta» en la web social. Entrar, el perfil, la privacidad y salir son del SDK;
 * aquí están además el estado de la sincronización y borrar los datos de Nodaria. Antes de cambiar de
 * cuenta se sube lo pendiente; lo que quede sin subir se aparta para su cuenta (`state/sync.tsx`).
 */
export function AccountButton() {
  const { status, user, restrictions, signIn, getToken, savedAccounts, chooseAccount, addAccount } = useAuth();
  const sync = useSync();
  const toast = useToast();
  const { confirm } = useDialogs();
  const [signingOut, setSigningOut] = useState<'one' | 'all' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const [saved, setSaved] = useState<SavedAccount[]>([]);
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

  // Las cuentas guardadas se piden al abrir el menú: pueden cambiar desde otra web.
  useEffect(() => {
    if (!menuAnchor || !account) return;
    let cancelled = false;
    void savedAccounts()
      .then(list => !cancelled && setSaved(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [menuAnchor, account, savedAccounts]);
  const others = saved.filter(a => !a.activa && a.cuenta.id.toLowerCase() !== account);

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
    const label = 'Entrar con tu cuenta de Yosiftware (opcional: sincroniza tus proyectos)';
    return (
      <button
        type="button"
        className="icon-btn account-sign-in"
        aria-label={label}
        data-tooltip={label}
        data-tooltip-side="left"
        onClick={() => void signIn()}
      >
        <YosiSymbol size={18} />
      </button>
    );
  }

  /** Antes de dejar esta cuenta se sube lo pendiente (si se puede); luego cambia en todas las webs. */
  const leaveFor = async (go: () => Promise<unknown>) => {
    await sync.syncNow().catch(() => undefined);
    await go();
  };

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
    ? `${new Date(sync.lastSyncAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} · Sincronizar ahora`
    : undefined;
  const entries: MenuEntry[] = [
    { section: user?.alias ?? 'Cuenta' },
    // El estado de la sincronización es también el botón de sincronizar ahora: una fila menos en el menú.
    {
      label: syncLabel,
      hint: sync.state === 'syncing' ? undefined : (syncHint ?? 'Sincronizar ahora'),
      icon: sync.state === 'offline' ? CloudOff : sync.state === 'error' ? CloudAlert : Cloud,
      disabled: sync.state === 'syncing',
      onSelect: () => void sync.syncNow(),
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
    { label: 'Comunidad', icon: Globe, onSelect: openCommunity },
    {
      label: 'Invitaciones a grupos',
      icon: MailOpen,
      onSelect: () => void sdk()?.espacios?.verInvitaciones(),
    },
    'separator',
    ...(others.length ? [{ section: 'Otras cuentas' } satisfies MenuEntry] : []),
    ...others.map((a): MenuEntry => ({
      label: a.nombre || a.cuenta.alias,
      leading: <SavedAvatar account={a} />,
      onSelect: () => void leaveFor(() => chooseAccount(a.sesion)),
    })),
    { label: 'Añadir otra cuenta', icon: UserRoundPlus, onSelect: () => void leaveFor(addAccount) },
    'separator',
    { label: 'Mi perfil', icon: UserRoundPen, onSelect: () => void sdk()?.editarPerfil() },
    { label: 'Privacidad', icon: ShieldCheck, onSelect: () => void sdk()?.privacidad() },
    {
      label: 'Gestionar tu cuenta',
      leading: <YosiSymbol className="menu-symbol" />,
      onSelect: () => window.open(SOCIAL_URL, '_blank', 'noopener'),
    },
    'separator',
    { label: 'Cerrar sesión', icon: LogOut, onSelect: () => setSigningOut('one') },
    ...(others.length
      ? [{ label: 'Cerrar sesión en todas las cuentas', icon: LogOut, onSelect: () => setSigningOut('all') }]
      : []),
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
      {signingOut && <SignOutDialog all={signingOut === 'all'} onClose={() => setSigningOut(null)} />}
    </>
  );
}

/** La miniatura de una cuenta guardada, o su inicial. */
function SavedAvatar({ account }: { account: SavedAccount }) {
  const name = account.nombre || account.cuenta.alias || '?';
  return (
    <span className="saved-account-avatar" aria-hidden>
      {account.avatar ? <img src={account.avatar} alt="" /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
