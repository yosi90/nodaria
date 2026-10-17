import { Crown, LogOut, Mail, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  changeMemberRole,
  groupErrorMessage,
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
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';
import { Button } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

/**
 * El grupo del proyecto abierto: miembros, invitaciones, roles, salir y borrar. La pertenencia es de la
 * plataforma (ecosistema-kit/ESPACIOS.md): estas acciones van a su API con el token de la plataforma, y
 * la API de Nodaria se entera por el feed. Borrar el grupo pasa por Nodaria, que entrega el proyecto.
 */
export function GroupDialog({ group, onClose }: { group: GroupInfo; onClose: () => void }) {
  const { user } = useAuth();
  const { refresh, leave, removeGroup, present } = useGroups();
  const { confirm } = useDialogs();
  const toast = useToast();
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  const [invitations, setInvitations] = useState<SpaceInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('lector');
  const [recipient, setRecipient] = useState<string>(user?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quien tiene la propiedad y el rol responsable gestionan e invitan (lo aplica la plataforma).
  const canManage = group.isOwner || group.role === 'responsable';

  const load = useCallback(async () => {
    try {
      setMembers(await spaceMembers(group.spaceId));
      if (canManage) setInvitations(await spaceInvitations(group.spaceId));
    } catch (failure) {
      setError(groupErrorMessage(failure));
    }
  }, [group.spaceId, canManage]);
  useEffect(() => void load(), [load]);

  /** Una acción sobre la pertenencia: al terminar, la lista y la API de Nodaria se ponen al día. */
  const act = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      if (done) toast({ message: done });
      await load();
      void refresh();
    } catch (failure) {
      setError(groupErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const invite = () =>
    act(async () => {
      await inviteToSpace(group.spaceId, email.trim(), role);
      setEmail('');
    }, `Invitación enviada a ${email.trim()}. Le llegará por correo y, si tiene cuenta, como aviso.`);

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
        recipient.toLowerCase() === user?.id ? 'tu cuenta' : (who?.nombre ?? who?.alias ?? 'esa persona')
      }.`,
      confirmLabel: 'Borrar el grupo',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeGroup(group, recipient);
      toast({ message: `Grupo «${group.name}» borrado.` });
      onClose();
    } catch (failure) {
      setError(groupErrorMessage(failure));
      setBusy(false);
    }
  };

  const active = (members ?? []).filter(m => m.estado === 'activo');

  return (
    <Modal title={`Grupo «${group.name}»`} informational wide onClose={onClose}>
      <div className="group-dialog">
        <p className="muted-note">
          Tu rol: <strong>{group.isOwner ? 'propiedad del grupo' : roleLabel(group.role)}</strong>.{' '}
          {group.isOwner ? 'Puedes hacerlo todo, también borrar el grupo.' : ROLE_DESCRIPTIONS[group.role]}
        </p>
        {error && (
          <p className="group-error" role="alert">
            {error}
          </p>
        )}

        <section aria-label="Miembros">
          <h3 className="group-section-title">Miembros{members ? ` (${members.length})` : ''}</h3>
          {!members ? (
            <p className="muted-note">Cargando…</p>
          ) : (
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
                        options={ROLE_OPTIONS}
                        value={member.rol ?? 'lector'}
                        disabled={busy}
                        onChange={next =>
                          next &&
                          next !== member.rol &&
                          void act(
                            () => changeMemberRole(group.spaceId, member.cuenta, next),
                            `${member.alias} ahora es ${roleLabel(next)}.`,
                          )
                        }
                      />
                    ) : (
                      <span className="badge">{member.propietario ? 'Propiedad' : roleLabel(member.rol ?? '')}</span>
                    )}
                    <span className="group-member-actions">
                      {group.isOwner && !me && member.estado === 'activo' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Crown}
                          disabled={busy}
                          title="Ofrecerle la propiedad: la tendrá cuando la acepte"
                          onClick={() =>
                            void act(
                              () => offerOwnership(group.spaceId, member.cuenta),
                              `Propiedad ofrecida a ${member.alias}. La tendrá cuando la acepte.`,
                            )
                          }
                        >
                          Ceder
                        </Button>
                      )}
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
          )}
        </section>

        {canManage && (
          <section aria-label="Invitar">
            <h3 className="group-section-title">Invitar</h3>
            <div className="group-invite">
              <label className="field">
                Correo
                <input
                  type="email"
                  value={email}
                  placeholder="persona@ejemplo.es"
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
                  options={ROLE_OPTIONS}
                  value={role}
                  onChange={v => v && setRole(v)}
                />
              </div>
              <Button variant="primary" icon={UserPlus} disabled={busy || !email.trim()} onClick={() => void invite()}>
                Invitar
              </Button>
            </div>
            <small className="field-hint">
              {ROLE_DESCRIPTIONS[role]} La plataforma envía el correo; nunca sabrás si esa dirección tiene cuenta.
              Caduca a los 14 días.
            </small>
            {invitations.length > 0 && (
              <ul className="group-members">
                {invitations.map(invitation => (
                  <li key={invitation.id}>
                    <span className="group-member-name">
                      <Mail size={13} aria-hidden /> {invitation.alias ?? invitation.correo ?? 'Invitación'}
                      <span className="badge">pendiente</span>
                    </span>
                    <span className="badge">{roleLabel(invitation.rol ?? 'lector')}</span>
                    <span className="group-member-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void act(() => retireInvitation(group.spaceId, invitation.id), 'Invitación retirada.')
                        }
                      >
                        Retirar
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-label="Dejar el grupo" className="group-danger">
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
                      label: m.cuenta.toLowerCase() === user?.id ? 'Yo' : (m.nombre ?? m.alias),
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
      </div>
    </Modal>
  );
}
