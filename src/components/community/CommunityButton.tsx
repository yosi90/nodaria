import { Globe } from 'lucide-react';
import { useCommunityPending } from '../../state/communityPending';
import { useNavigation } from '../../state/navigation';

/**
 * El botón de «Comunidad» en la barra: a la vista, con el número de mensajes sin leer y de solicitudes de
 * amistad. Si ya se está en Comunidad, vuelve a la vista del proyecto.
 */
export function CommunityButton({ compact = false }: { compact?: boolean }) {
  const { view, openCommunity, setView, projectView } = useNavigation();
  const { unread, requests } = useCommunityPending();
  const active = view === 'community';
  const pending = unread + requests;
  const detail = [
    unread ? `${unread} ${unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}` : '',
    requests ? `${requests} ${requests === 1 ? 'solicitud de amistad' : 'solicitudes de amistad'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={`community-button ${active ? 'active' : ''}`}
      aria-pressed={active}
      aria-label={`Comunidad${detail ? `: ${detail}` : ''}`}
      data-tooltip={compact ? `Comunidad${detail ? ` · ${detail}` : ''}` : detail || undefined}
      onClick={() =>
        active ? setView(projectView) : openCommunity({ tab: unread && !requests ? 'chats' : undefined })
      }
    >
      <Globe size={16} aria-hidden />
      {!compact && <span className="label">Comunidad</span>}
      {pending > 0 && <span className="community-badge">{pending > 99 ? '99+' : pending}</span>}
    </button>
  );
}
