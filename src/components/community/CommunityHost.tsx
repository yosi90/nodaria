import { useEffect, useState } from 'react';
import { CommunityDialog } from './CommunityDialog';
import { OPEN_COMMUNITY_EVENT } from './openCommunity';

/** Abre «Comunidad» desde cualquier sitio (menú de la cuenta, paleta) con `openCommunity()`. */
export function CommunityHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_COMMUNITY_EVENT, show);
    return () => window.removeEventListener(OPEN_COMMUNITY_EVENT, show);
  }, []);
  return open ? <CommunityDialog onClose={() => setOpen(false)} /> : null;
}
