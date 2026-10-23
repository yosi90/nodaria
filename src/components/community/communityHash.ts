import { useEffect, useRef } from 'react';
import { useNavigation, type CommunityRoute, type CommunityTab } from '../../state/navigation';

const TABS: CommunityTab[] = ['inicio', 'descubrir', 'personas', 'chats', 'publicados', 'persona'];

/** `#comunidad`, `#comunidad/personas`, `#comunidad/persona/<id>` o `#comunidad/chats/<conversación>`. */
export function parseCommunityHash(hash: string): Partial<CommunityRoute> | null {
  const match = /^#comunidad(?:\/([a-z]+)(?:\/([^/]+))?)?$/.exec(hash);
  if (!match) return null;
  const tab = TABS.includes(match[1] as CommunityTab) ? (match[1] as CommunityTab) : undefined;
  if (tab === 'persona' && match[2]) return { tab, person: decodeURIComponent(match[2]) };
  if (tab === 'chats' && match[2] && /^\d+$/.test(match[2])) return { tab, conversation: Number(match[2]) };
  return tab && tab !== 'persona' ? { tab } : {};
}

export function communityHash(route: CommunityRoute) {
  if (route.tab === 'persona' && route.person) return `#comunidad/persona/${encodeURIComponent(route.person)}`;
  if (route.tab === 'chats' && route.conversation) return `#comunidad/chats/${route.conversation}`;
  return `#comunidad/${route.tab}`;
}

/**
 * La dirección sigue a «Comunidad» (`#comunidad/…`): se puede enlazar a un perfil o a un chat (la página
 * pública enlaza así a quien la publicó) y recargar sin perder dónde se estaba. Al salir, se quita.
 */
export function useCommunityHash() {
  const { view, community, openCommunity } = useNavigation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const route = parseCommunityHash(window.location.hash);
    if (route) openCommunity(route);
    const onHash = () => {
      const next = parseCommunityHash(window.location.hash);
      if (next) openCommunity(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [openCommunity]);

  useEffect(() => {
    if (!started.current) return;
    const { pathname, search } = window.location;
    const wanted = view === 'community' ? communityHash(community) : '';
    const current = window.location.hash.startsWith('#comunidad') ? window.location.hash : '';
    if (wanted === current || (!wanted && !current)) return;
    window.history.replaceState(null, '', `${pathname}${search}${wanted}`);
  }, [view, community]);
}
