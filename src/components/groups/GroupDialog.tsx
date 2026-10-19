import { CheckCircle2, Crown, LogOut, Mail, Settings, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  canManageGroup,
  changeMemberRole,
  groupErrorMessage,
  setGroupRoleLabels,
  inviteToSpace,
  offerOwnership,
  removeMember,
  retireInvitation,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  roleLabel,
  spaceInvitations,
  spaceMembers,
  type GroupInfo,
  type SpaceInvitation,
  type SpaceMember,
} from '../../services/groups';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';
import { Button } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';

/** `invite`: solo invitar (al crear el grupo o desde su menú). `manage`: miembros, invitaciones y ajustes. */
export type GroupDialogMode = 'invite' | 'manage';
type Tab = 'members' | 'invitations' | 'settings';

/**
 * El grupo del proyecto abierto. La pertenencia es de la plataforma (ecosistema-kit/ESPACIOS.md): estas
 * acciones van a su API con el token de la plataforma, y la API de Nodaria se entera por el feed. Borrar
 * el grupo pasa por Nodaria, que entrega el proyecto.
 *
 * Los avisos de cada acción se enseñan dentro del diálogo: un toast quedaría debajo del `<dialog>` modal.
 */
export function GroupDialog({
  group,
  mode,
  justCreated,
  onClose,
}: {
  group: GroupInfo;
  mode: GroupDialogMode;
  /** Recién creado desde «Compartir con un grupo»: lo dice antes de invitar. */
  justCreated?: boolean;
  onClose: () => void;
}) {
  const admin = useGroupAdmin(group);
  const { project } = useApp();
  const [tab, setTab] = useState<Tab>('members');

  if (mode === 'invite')
    return (
      <Modal title={`Invitar al grupo «${group.name}»`} informational wide onClose={onClose}>
        <div className="group-dialog">
          {justCreated && !admin.notice && !admin.error && (
            <p className="group-notice" role="status">
              <CheckCircle2 size={16} aria-hidden />
              <span>
                Grupo creado: «{project.name}» ya es del grupo. Invita a las personas con las que lo compartes. Los
                miembros, los roles y el resto de ajustes están en «Gestionar el grupo».
              </span>
            </p>
          )}
          <Feedback admin={admin} />
          <InvitationsSection admin={admin} />
        </div>
      </Modal>
    );

  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'members', label: 'Miembros', icon: Users, count: admin.members?.length },
    ...(admin.canManage
      ? [{ id: 'invitations' as const, label: 'Invitaciones', icon: UserPlus, count: admin.invitations.length }]
      : []),
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];
  return (
    <Modal title={`Grupo «${group.name}»`} informational wide onClose={onClose}>
      <div className="group-dialog">
        <p className="muted-note">
          Tu rol:{' '}
          <strong>
            {group.isOwner ? 'propiedad del grupo' : roleLabel(group.role, project.kind, group.roleLabels)}
          </strong>
          . {group.isOwner ? 'Puedes hacerlo todo, también borrar el grupo.' : ROLE_DESCRIPTIONS[group.role]}
        </p>
        <div className="segmented group-tabs" role="tablist" aria-label="Gestión del grupo">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                admin.clearFeedback();
              }}
            >
              <t.icon size={14} aria-hidden />
              <span className="label">{t.label}</span>
              {t.count ? <span className="badge">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <Feedback admin={admin} />
        {tab === 'members' && <MembersSection admin={admin} />}
        {tab === 'invitations' && admin.canManage && <InvitationsSection admin={admin} />}
        {tab === 'settings' && <SettingsSection admin={admin} onClose={onClose} />}
      </div>
    </Modal>
  );
}

type GroupAdmin = ReturnType<typeof useGroupAdmin>;

/** Estado compartido por las secciones: miembros, invitaciones y el resultado de la última acción. */
function useGroupAdmin(group: GroupInfo) {
  const { project } = useApp();
  const { refresh } = useGroups();
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  const [invitations, setInvitations] = useState<SpaceInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = canManageGroup(group);
  // Los nombres de rol del tipo de proyecto, con el general de la plataforma al lado.
  const roleOptions = Object.keys(ROLE_LABELS).map(value => {
    const label = roleLabel(value, project.kind, group.roleLabels);
    return { value, label: label === ROLE_LABELS[value] ? label : `${label} (${ROLE_LABELS[value]})` };
  });

  const load = useCallback(async () => {
    try {
      setMembers(await spaceMembers(group.spaceId));
      if (!canManage) return [];
      const found = await spaceInvitations(group.spaceId);
      setInvitations(found);
      return found;
    } catch (failure) {
      setError(groupErrorMessage(failure));
      return null;
    }
  }, [group.spaceId, canManage]);
  useEffect(() => void load(), [load]);

  /**
   * Una acción sobre la pertenencia: al terminar, la lista y la API de Nodaria se ponen al día. Devuelve
   * las invitaciones recargadas, o `false` si la acción falló.
   */
  const act = async (work: () => Promise<unknown>, done?: string): Promise<SpaceInvitation[] | false> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      if (done) setNotice(done);
      const found = await load();
      void refresh();
      return found ?? [];
    } catch (failure) {
      setError(groupErrorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clearFeedback = () => {
    setError(null);
    setNotice(null);
  };

  return {
    group,
    members,
    invitations,
    busy,
    setBusy,
    error,
    setError,
    notice,
    canManage,
    roleOptions,
    load,
    act,
    clearFeedback,
  };
}

function Feedback({ admin }: { admin: GroupAdmin }) {
  if (admin.error)
    return (
      <p className="group-error" role="alert">
        {admin.error}
      </p>
    );
  if (admin.notice)
    return (
      <p className="group-notice" role="status">
        <CheckCircle2 size={16} aria-hidden />
        <span>{admin.notice}</span>
      </p>
    );
  return null;
}

const expiry = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
};

function InvitationsSection({ admin }: { admin: GroupAdmin }) {
  const { project } = useApp();
  const { group, invitations, busy, roleOptions, act } = admin;
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('lector');
  // Las invitaciones que acaban de salir, para destacarlas en la lista de pendientes.
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  if (!admin.canManage) return <p className="muted-note">Solo quien gestiona el grupo puede invitar a más personas.</p>;

  const invite = async () => {
    const address = email.trim();
    const before = new Set(invitations.map(i => i.id));
    const after = await act(
      () => inviteToSpace(group.spaceId, address, role),
      `Invitación enviada a ${address} como ${roleLabel(role, project.kind, group.roleLabels)}. Le llega por correo y, si ya tiene cuenta, también como aviso. Pasará a Miembros cuando la acepte; mientras, queda abajo como pendiente.`,
    );
    if (!after) return;
    setEmail('');
    setFresh(new Set(after.filter(i => !before.has(i.id)).map(i => i.id)));
  };

  return (
    <section aria-label="Invitar" className="group-section">
      <div className="group-invite">
        <label className="field">
          Correo
          <input
            type="email"
            value={email}
            placeholder="persona@ejemplo.es"
            autoFocus
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (email.trim() && !busy) void invite();
            }}
          />
        </label>
        <div className="field">
          Rol
          <Select
            aria-label="Rol de la invitación"
            options={roleOptions}
            value={role}
            onChange={v => v && setRole(v)}
          />
        </div>
        <Button variant="primary" icon={UserPlus} disabled={busy || !email.trim()} onClick={() => void invite()}>
          {busy ? 'Enviando…' : 'Invitar'}
        </Button>
      </div>
      <small className="field-hint">
        {ROLE_DESCRIPTIONS[role]} La plataforma envía el correo; nunca sabrás si esa dirección tiene cuenta. Caduca a
        los 14 días.
      </small>

      <h3 className="group-section-title">
        Pendientes de aceptar{invitations.length ? ` (${invitations.length})` : ''}
      </h3>
      {invitations.length === 0 ? (
        <p className="muted-note">No hay invitaciones pendientes.</p>
      ) : (
        <ul className="group-members">
          {invitations.map(invitation => {
            const until = expiry(invitation.caduca);
            return (
              <li key={invitation.id} className={fresh.has(invitation.id) ? 'fresh' : undefined}>
                <span className="group-member-name">
                  <Mail size={13} aria-hidden /> {invitation.alias ?? invitation.correo ?? 'Invitación'}
                  <span className="badge warning" title="Enviada; aún no la ha aceptado">
                    {fresh.has(invitation.id) ? 'enviada ahora' : 'pendiente'}
                  </span>
                  {until && <span className="group-member-meta">caduca el {until}</span>}
                </span>
                <span className="badge">{roleLabel(invitation.rol ?? 'lector', project.kind, group.roleLabels)}</span>
                <span className="group-member-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => retireInvitation(group.spaceId, invitation.id),
                        `Invitación a ${invitation.alias ?? invitation.correo ?? 'esa persona'} retirada.`,
                      )
                    }
                  >
                    Retirar
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MembersSection({ admin }: { admin: GroupAdmin }) {
  const { user } = useAuth();
  const { project } = useApp();
  const { present } = useGroups();
  const { group, members, busy, canManage, roleOptions, act } = admin;

  if (!members) return <p className="muted-note">Cargando…</p>;
  return (
    <section aria-label="Miembros" className="group-section">
      <ul className="group-members">
        {members.map(member => {
          const me = member.cuenta.toLowerCase() === user?.id;
          return (
            <li key={member.cuenta}>
              <span className="group-member-name">
                {member.nombre ?? member.alias}
                {me && <span className="badge">tú</span>}
                {!me && present.includes(member.cuenta.toLowerCase()) && (
                  <span className="badge online" title="Tiene el proyecto abierto ahora">
                    conectado
                  </span>
                )}
                {member.propietario && (
                  <span className="badge accent">
                    <Crown size={11} aria-hidden /> propiedad
                  </span>
                )}
                {member.estado !== 'activo' && (
                  <span className="badge warning" title="El grupo exige la verificación en dos pasos">
                    en pausa
                  </span>
                )}
              </span>
              {canManage && !me && !member.propietario ? (
                <Select
                  compact
                  aria-label={`Rol de ${member.alias}`}
                  options={roleOptions}
                  value={member.rol ?? 'lector'}
                  disabled={busy}
                  onChange={next =>
                    next &&
                    next !== member.rol &&
                    void act(
                      () => changeMemberRole(group.spaceId, member.cuenta, next),
                      `${member.alias} ahora es ${roleLabel(next, project.kind, group.roleLabels)}.`,
                    )
                  }
                />
              ) : (
                <span className="badge">
                  {member.propietario ? 'Propiedad' : roleLabel(member.rol ?? '', project.kind, group.roleLabels)}
                </span>
              )}
              <span className="group-member-actions">
                {canManage && !me && !member.propietario && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={UserMinus}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => removeMember(group.spaceId, member.cuenta),
                        `${member.alias} ya no está en el grupo.`,
                      )
                    }
                  >
                    Sacar
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SettingsSection({ admin, onClose }: { admin: GroupAdmin; onClose: () => void }) {
  const { user, getToken } = useAuth();
  const { project } = useApp();
  const { leave, removeGroup } = useGroups();
  const { confirm } = useDialogs();
  const toast = useToast();
  const { group, members, busy, setBusy, setError, canManage, act } = admin;
  // Nombres propios de los roles del grupo, editables por quien gestiona.
  const [labels, setLabels] = useState<Record<string, string>>(group.roleLabels ?? {});
  const [recipient, setRecipient] = useState<string>(user?.id ?? '');
  const [heir, setHeir] = useState('');
  const active = (members ?? []).filter(m => m.estado === 'activo');
  const others = active.filter(m => m.cuenta.toLowerCase() !== user?.id);
  const nameOf = (m: SpaceMember) => m.nombre ?? m.alias;

  const leaveGroup = async () => {
    const ok = await confirm({
      title: 'Salir del grupo',
      message: `Dejarás de ver «${group.projects[0]?.name ?? group.name}». Solo podrás volver con una invitación.`,
      confirmLabel: 'Salir del grupo',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await leave(group);
      onClose();
    } catch (failure) {
      setError(groupErrorMessage(failure));
      setBusy(false);
    }
  };

  const deleteWholeGroup = async () => {
    const who = members?.find(m => m.cuenta.toLowerCase() === recipient.toLowerCase());
    const ok = await confirm({
      title: 'Borrar el grupo',
      message: `Se borrará el grupo «${group.name}» y sus miembros dejarán de ver el proyecto. El proyecto pasará a ser un proyecto propio de ${
        recipient.toLowerCase() === user?.id ? 'tu cuenta' : who ? nameOf(who) : 'esa persona'
      }.`,
      confirmLabel: 'Borrar el grupo',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeGroup(group, recipient);
      // El diálogo se cierra a la vez: aquí el toast ya queda a la vista.
      toast({ message: `Grupo «${group.name}» borrado.` });
      onClose();
    } catch (failure) {
      setError(groupErrorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <>
      {canManage && (
        <section aria-label="Nombres de los roles" className="group-section">
          <h3 className="group-section-title">Nombres de los roles</h3>
          <div className="group-role-names">
            {Object.keys(ROLE_LABELS).map(role => (
              <label key={role} className="field">
                {ROLE_LABELS[role]}
                <input
                  value={labels[role] ?? ''}
                  maxLength={40}
                  placeholder={roleLabel(role, project.kind)}
                  onChange={e => setLabels(current => ({ ...current, [role]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="group-role-names-actions">
            <small className="field-hint">
              Solo cambian cómo se llaman en Nodaria; lo que puede hacer cada rol sigue igual. Vacío: el nombre del tipo
              de proyecto.
            </small>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const token = await getToken();
                  if (!token) throw new Error('Entra con tu cuenta de Yosiftware.');
                  const clean = Object.fromEntries(
                    Object.entries(labels)
                      .map(([role, name]) => [role, name.trim()])
                      .filter(([, name]) => name),
                  );
                  await setGroupRoleLabels(token, group.id, Object.keys(clean).length ? clean : null);
                }, 'Nombres de los roles guardados.')
              }
            >
              Guardar los nombres
            </Button>
          </div>
        </section>
      )}

      {group.isOwner && (
        <section aria-label="Ceder la propiedad" className="group-section">
          <h3 className="group-section-title">Ceder la propiedad</h3>
          {others.length === 0 ? (
            <p className="muted-note">Cuando haya otros miembros podrás ofrecerles la propiedad del grupo.</p>
          ) : (
            <>
              <div className="group-invite">
                <div className="field">
                  A quién
                  <Select
                    aria-label="A quién ceder la propiedad"
                    placeholder="Elige un miembro"
                    options={others.map(m => ({ value: m.cuenta, label: nameOf(m) }))}
                    value={heir || null}
                    onChange={v => setHeir(v ?? '')}
                  />
                </div>
                <Button
                  icon={Crown}
                  disabled={busy || !heir}
                  onClick={() => {
                    const who = others.find(m => m.cuenta === heir);
                    void act(
                      () => offerOwnership(group.spaceId, heir),
                      `Propiedad ofrecida a ${who ? nameOf(who) : 'ese miembro'}. La tendrá cuando la acepte; hasta entonces sigue siendo tuya.`,
                    );
                  }}
                >
                  Ofrecer la propiedad
                </Button>
              </div>
              <small className="field-hint">Quien la acepte podrá hacerlo todo, también borrar el grupo.</small>
            </>
          )}
        </section>
      )}

      <section aria-label="Dejar el grupo" className="group-section group-danger">
        {group.isOwner ? (
          <>
            <h3 className="group-section-title">Borrar el grupo</h3>
            <div className="group-invite">
              <div className="field">
                Quién se queda el proyecto
                <Select
                  aria-label="Quién se queda el proyecto"
                  options={active.map(m => ({
                    value: m.cuenta.toLowerCase(),
                    label: m.cuenta.toLowerCase() === user?.id ? 'Yo' : nameOf(m),
                  }))}
                  value={recipient}
                  onChange={v => v && setRecipient(v)}
                />
              </div>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={busy || !recipient}
                onClick={() => void deleteWholeGroup()}
              >
                Borrar el grupo…
              </Button>
            </div>
            <small className="field-hint">
              El proyecto pasa a ser un proyecto propio de quien elijas, y el resto deja de verlo.
            </small>
          </>
        ) : (
          <Button variant="danger" icon={LogOut} disabled={busy} onClick={() => void leaveGroup()}>
            Salir del grupo
          </Button>
        )}
      </section>
    </>
  );
}
