import { useEffect, useMemo, useState } from 'react';
import { spaceMembers, type GroupInfo, type SpaceMember } from '../../services/groups';

/**
 * Miembros del grupo del proyecto abierto, para asignar entradas de la agenda y enseñar a quién. Se
 * piden a la plataforma al abrir la vista; sin grupo o sin conexión, la lista queda vacía.
 */
export function useGroupMembers(group: GroupInfo | null) {
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const spaceId = group?.spaceId ?? null;
  useEffect(() => {
    if (spaceId === null) return;
    let cancelled = false;
    void spaceMembers(spaceId)
      .then(found => {
        if (!cancelled) setMembers(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [spaceId]);
  return useMemo(() => {
    const list = spaceId === null ? [] : members;
    const names = new Map(list.map(m => [m.cuenta.toLowerCase(), m.nombre ?? m.alias]));
    return {
      members: list,
      /** Nombre de una cuenta, o «Antiguo miembro» si ya no está en el grupo. */
      nameOf: (account: string) => names.get(account.toLowerCase()) ?? 'Antiguo miembro',
    };
  }, [members, spaceId]);
}
