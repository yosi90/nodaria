import { Ban, Flag, MessageSquare, MoreHorizontal, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  answerFriendRequest,
  directConversation,
  personName,
  relationship,
  removeFriend,
  requestFriendship,
  setBlocked,
  setFollowing,
  socialErrorMessage,
  withdrawFriendRequest,
  type Person,
  type Relationship,
} from '../../services/community';
import { useNavigation } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { report } from './communityHelpers';

/**
 * Lo que se puede hacer con una persona, con las rutas de la plataforma (`ecosistema-kit/SOCIAL.md`):
 * seguir, pedir, aceptar o dejar la amistad, escribirle (las directas son solo entre amistades), bloquear y
 * denunciar. Nodaria no guarda nada de esto. Si no hay nadie (un 404, también por un bloqueo), no se enseña.
 */
export function RelationActions({
  person,
  compact = false,
  onChange,
}: {
  person: Person;
  compact?: boolean;
  /** Tras un cambio (para que la lista que la contiene se ponga al día). */
  onChange?: () => void;
}) {
  const toast = useToast();
  const { confirm } = useDialogs();
  const { openCommunity } = useNavigation();
  const [relation, setRelation] = useState<Relationship | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Anchor | null>(null);

  useEffect(() => {
    let alive = true;
    relationship(person.id).then(
      found => alive && setRelation(found),
      () => alive && setRelation(null),
    );
    return () => {
      alive = false;
    };
  }, [person.id]);

  if (!relation) return null;
  const name = personName(person);

  /** Hace el cambio y lo aplica: lo que se sabe de antemano (`next`) y lo que devuelva la plataforma. */
  const act = async (
    work: () => Promise<Partial<Relationship> | void>,
    next: Partial<Relationship>,
    message?: string,
  ) => {
    setBusy(true);
    try {
      const answer = await work();
      setRelation(current => (current ? { ...current, ...next, ...(answer ?? {}) } : current));
      if (message) toast({ message });
      onChange?.();
    } catch (error) {
      toast({ message: socialErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const follow = () => act(() => setFollowing(person.id, !relation.sigo), { sigo: !relation.sigo });
  const askFriendship = () =>
    act(
      async () => {
        const result = await requestFriendship(person.id);
        return {
          amistad: result.estado === 'amistades' ? ('amistades' as const) : ('solicitud_enviada' as const),
          idSolicitud: result.idSolicitud,
        };
      },
      {},
      'Solicitud de amistad enviada',
    );
  const answer = (accept: boolean) =>
    act(
      () => answerFriendRequest(relation.idSolicitud!, accept),
      { amistad: accept ? 'amistades' : 'ninguna', idSolicitud: null },
      accept ? `Ahora sois amistades con ${name}` : 'Solicitud rechazada',
    );
  const withdraw = () =>
    act(() => withdrawFriendRequest(relation.idSolicitud!), { amistad: 'ninguna', idSolicitud: null });
  const unfriend = async () => {
    if (
      !(await confirm({
        title: 'Dejar la amistad',
        message: `Dejaréis de ser amistades con ${name}. Vuestra conversación directa queda de solo lectura.`,
        confirmLabel: 'Dejar la amistad',
        danger: true,
      }))
    )
      return;
    await act(() => removeFriend(person.id), { amistad: 'ninguna' });
  };
  const block = async () => {
    if (relation.bloqueada)
      return act(() => setBlocked(person.id, false), { bloqueada: false }, `${name} desbloqueada`);
    if (
      !(await confirm({
        title: 'Bloquear',
        message: `${name} no podrá verte ni escribirte en ninguna web de Yosiftware, y dejaréis de seguiros y de ser amistades. No se le avisa.`,
        confirmLabel: 'Bloquear',
        danger: true,
      }))
    )
      return;
    await act(
      () => setBlocked(person.id, true),
      { bloqueada: true, sigo: false, amistad: 'ninguna' },
      `${name} bloqueada`,
    );
  };
  const write = async () => {
    setBusy(true);
    try {
      openCommunity({ tab: 'chats', conversation: await directConversation(person.id) });
    } catch (error) {
      toast({ message: socialErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  if (relation.bloqueada)
    return (
      <div className="relation-actions">
        <Button size="sm" icon={Ban} disabled={busy} onClick={() => void block()}>
          Desbloquear
        </Button>
      </div>
    );

  const friendship =
    relation.amistad === 'amistades' ? (
      <Button size="sm" icon={Users} disabled={busy} title="Sois amistades" onClick={() => void unfriend()}>
        {compact ? '' : 'Amistades'}
      </Button>
    ) : relation.amistad === 'solicitud_recibida' ? (
      <>
        <Button size="sm" variant="primary" icon={UserCheck} disabled={busy} onClick={() => void answer(true)}>
          Aceptar amistad
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer(false)}>
          Rechazar
        </Button>
      </>
    ) : relation.amistad === 'solicitud_enviada' ? (
      <Button size="sm" variant="ghost" disabled={busy} title="Retirar la solicitud" onClick={() => void withdraw()}>
        Solicitud enviada
      </Button>
    ) : (
      <Button size="sm" icon={UserPlus} disabled={busy} onClick={() => void askFriendship()}>
        {compact ? 'Amistad' : 'Añadir amistad'}
      </Button>
    );

  const more: MenuEntry[] = [
    ...(relation.amistad === 'amistades'
      ? [{ label: 'Dejar la amistad', icon: UserMinus, onSelect: () => void unfriend() }]
      : []),
    { label: 'Bloquear', icon: Ban, danger: true, onSelect: () => void block() },
    {
      label: 'Denunciar',
      icon: Flag,
      danger: true,
      onSelect: () => report({ tipo: 'persona', referencia: person.id, nombre: name, persona: person.id }),
    },
  ];

  return (
    <div className="relation-actions">
      <Button
        size="sm"
        variant={relation.sigo ? 'secondary' : 'primary'}
        icon={relation.sigo ? UserCheck : UserPlus}
        disabled={busy}
        aria-pressed={relation.sigo}
        onClick={() => void follow()}
      >
        {relation.sigo ? 'Siguiendo' : relation.meSigue ? 'Seguir también' : 'Seguir'}
      </Button>
      {friendship}
      {relation.amistad === 'amistades' && (
        <Button size="sm" icon={MessageSquare} disabled={busy} onClick={() => void write()}>
          {compact ? '' : 'Mensaje'}
        </Button>
      )}
      <IconButton
        icon={MoreHorizontal}
        size="sm"
        variant="ghost"
        label={`Más acciones con ${name}`}
        aria-haspopup="menu"
        onClick={event => setMenu(menu ? null : anchorOf(event.currentTarget))}
      />
      {menu && <Menu anchor={menu} entries={more} label={`Acciones con ${name}`} onClose={() => setMenu(null)} />}
    </div>
  );
}
