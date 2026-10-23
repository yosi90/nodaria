export const OPEN_COMMUNITY_EVENT = 'nodaria-open-community';

/** Abre la sección «Comunidad» (`CommunityHost`, montado en `App`). */
export const openCommunity = () => window.dispatchEvent(new Event(OPEN_COMMUNITY_EVENT));
