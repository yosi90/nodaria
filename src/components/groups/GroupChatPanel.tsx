import { MessagesSquare, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { groupConversation, groupErrorMessage, type GroupInfo } from '../../services/groups';
import { useAuth } from '../../state/auth';
import { usePreferences } from '../../state/preferences';
import { IconButton } from '../common/Button';
import { Splitter } from '../common/Splitter';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** La conversación del chat de la plataforma (`ecosistema-kit/CHAT.md`), del SDK. */
      'yosi-chat-conversacion': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        conversacion?: string;
      };
    }
  }
}

/**
 * El chat del grupo del proyecto abierto (hito 4): la conversación del espacio en el chat de la
 * plataforma, incrustada con su elemento. La API de Nodaria la pide (la crea la primera vez); quién
 * escribe lo decide la plataforma según el rol. Los mensajes no pasan por Nodaria.
 */
export function GroupChatPanel({ group, onClose }: { group: GroupInfo; onClose: () => void }) {
  const { getToken } = useAuth();
  const { preferences, setPreference } = usePreferences();
  const [conversation, setConversation] = useState<{ group: string; id: number } | null>(null);
  const [failure, setFailure] = useState<{ group: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Entra con tu cuenta de Yosiftware para chatear.');
        const { id } = await groupConversation(token, group.id);
        if (!cancelled) setConversation({ group: group.id, id });
      } catch (error) {
        if (!cancelled) setFailure({ group: group.id, message: groupErrorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, getToken]);

  const id = conversation?.group === group.id ? conversation.id : null;
  const error = failure?.group === group.id ? failure.message : null;
  return (
    <aside className="side-panel right group-chat-panel" aria-label={`Chat del grupo «${group.name}»`}>
      <Splitter
        width={preferences.groupChatWidth}
        grow="left"
        label="Redimensionar el chat del grupo"
        onChange={width => setPreference('groupChatWidth', width)}
      />
      <header className="group-chat-head">
        <MessagesSquare size={16} aria-hidden />
        <strong title={group.name}>{group.name}</strong>
        <IconButton icon={X} label="Cerrar el chat" size="sm" onClick={onClose} />
      </header>
      {error ? (
        <p className="group-error group-chat-message" role="alert">
          {error}
        </p>
      ) : id === null ? (
        <p className="muted-note group-chat-message">Abriendo el chat del grupo…</p>
      ) : (
        <yosi-chat-conversacion key={id} conversacion={String(id)} />
      )}
    </aside>
  );
}
