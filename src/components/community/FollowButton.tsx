import { UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { relationship, setFollowing, type Relationship } from '../../services/community';
import { Button } from '../common/Button';
import { useToast } from '../common/toasts';

/**
 * Seguir a una persona, con las rutas de la plataforma (`ecosistema-kit/SOCIAL.md`): Nodaria no guarda
 * seguidores. No se enseña para una misma ni si no hay nadie (un bloqueo no se revela: es un 404).
 */
export function FollowButton({ personId }: { personId: string }) {
  const toast = useToast();
  const [relation, setRelation] = useState<Relationship | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    relationship(personId).then(
      found => alive && setRelation(found),
      () => alive && setRelation(null),
    );
    return () => {
      alive = false;
    };
  }, [personId]);

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
  return (
    <Button
      size="sm"
      variant={relation.sigo ? 'secondary' : 'primary'}
      icon={relation.sigo ? UserCheck : UserPlus}
      disabled={busy}
      aria-pressed={relation.sigo}
      onClick={() => void toggle()}
    >
      {relation.sigo ? 'Siguiendo' : relation.meSigue ? 'Seguir también' : 'Seguir'}
    </Button>
  );
}
