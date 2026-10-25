import { UserCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { setFollowing } from '../../services/community';
import { Button } from '../common/Button';
import { useToast } from '../common/toasts';
import { useRelationship } from './communityHelpers';

/**
 * Seguir a una persona, con las rutas de la plataforma (`ecosistema-kit/SOCIAL.md`): Nodaria no guarda
 * seguidores. No se enseña para una misma ni si no hay nadie (un bloqueo no se revela: es un 404).
 */
export function FollowButton({ personId }: { personId: string }) {
  const toast = useToast();
  const [relation, setRelation] = useRelationship(personId);
  const [busy, setBusy] = useState(false);

  if (!relation || relation.bloqueada) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      await setFollowing(personId, !relation.sigo);
      setRelation({ ...relation, sigo: !relation.sigo });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'No se ha podido cambiar.' });
    } finally {
      setBusy(false);
    }
  };
  return <FollowToggle following={relation.sigo} followsMe={relation.meSigue} busy={busy} onToggle={toggle} />;
}

/** El botón «Seguir / Seguir también / Siguiendo», aquí y en las acciones de una persona (`RelationActions`). */
export function FollowToggle({
  following,
  followsMe,
  busy,
  onToggle,
}: {
  following: boolean;
  followsMe: boolean;
  busy: boolean;
  onToggle: () => unknown;
}) {
  return (
    <Button
      size="sm"
      variant={following ? 'secondary' : 'primary'}
      icon={following ? UserCheck : UserPlus}
      disabled={busy}
      aria-pressed={following}
      onClick={() => void onToggle()}
    >
      {following ? 'Siguiendo' : followsMe ? 'Seguir también' : 'Seguir'}
    </Button>
  );
}
