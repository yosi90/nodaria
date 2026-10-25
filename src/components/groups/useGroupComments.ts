import { useCallback, useEffect, useState } from 'react';
import { listComments, type GroupComment } from '../../services/comments';
import { groupErrorMessage, type GroupInfo } from '../../services/groups';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';

/**
 * Los comentarios del proyecto abierto en su grupo, para la pestaña «Comentarios» del panel del grupo
 * (`GroupPanel`) y los de una entrada de la agenda (`EntryPanel`). Se cargan al abrir y cuando el canal del
 * grupo avisa de cambios; `act` hace algo con el token (comentar, resolver, borrar…) y vuelve a cargarlos.
 */
export function useGroupComments(group: GroupInfo) {
  const { project } = useApp();
  const { getToken, requireToken } = useAuth();
  const { commentsTick } = useGroups();
  const [comments, setComments] = useState<GroupComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setComments(await listComments(token, group.id, project.id));
      setError(null);
    } catch (failure) {
      setError(groupErrorMessage(failure));
    }
  }, [getToken, group.id, project.id]);
  useEffect(() => void load(), [load, commentsTick]);

  const act = async (work: (token: string) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work(await requireToken());
      await load();
    } catch (failure) {
      setError(groupErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return { comments, error, busy, act };
}
