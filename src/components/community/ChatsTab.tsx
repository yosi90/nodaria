import { PictureInPicture2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** La bandeja del chat de la plataforma (`ecosistema-kit/CHAT.md`), del SDK. */
      'yosi-chat-bandeja': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        seleccionada?: string;
      };
    }
  }
}

/**
 * «Chats»: el chat de la plataforma incrustado, con sus elementos (`<yosi-chat-bandeja>` y
 * `<yosi-chat-conversacion>`): las directas con amistades, los grupos y las conversaciones de los grupos de
 * trabajo. Nodaria no guarda mensajes. En el móvil se ve una cosa cada vez, con «volver» en la conversación.
 */
export function ChatsTab({ conversation }: { conversation: number | null }) {
  const { openCommunity } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const inbox = useRef<HTMLElement>(null);
  const chat = useRef<HTMLElement>(null);

  useEffect(() => {
    const tray = inbox.current;
    const open = chat.current;
    const select = (event: Event) => {
      const id = (event as CustomEvent<{ conversacion?: number }>).detail?.conversacion;
      if (typeof id === 'number') openCommunity({ tab: 'chats', conversation: id });
    };
    const leave = () => openCommunity({ tab: 'chats', conversation: null });
    tray?.addEventListener('yosi-chat-seleccion', select);
    open?.addEventListener('yosi-chat-fuera', leave);
    open?.addEventListener('yosi-chat-volver', leave);
    return () => {
      tray?.removeEventListener('yosi-chat-seleccion', select);
      open?.removeEventListener('yosi-chat-fuera', leave);
      open?.removeEventListener('yosi-chat-volver', leave);
    };
  }, [openCommunity, conversation]);

  return (
    <div className={`community-chats ${conversation ? 'has-conversation' : ''}`}>
      <div className="community-chats-tray">
        <yosi-chat-bandeja ref={inbox} seleccionada={conversation ? String(conversation) : undefined} />
        {/* Como en la web social: el interruptor de la ventana flotante, debajo de las conversaciones. */}
        <div className="community-chats-float">
          <span id="chat-float-label">
            <PictureInPicture2 size={15} aria-hidden /> Ventana flotante y burbujas
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={preferences.floatingChat}
            aria-labelledby="chat-float-label"
            onClick={() => setPreference('floatingChat', !preferences.floatingChat)}
          >
            <span className="switch-knob" aria-hidden />
          </button>
        </div>
      </div>
      {conversation ? (
        <yosi-chat-conversacion key={conversation} ref={chat} conversacion={String(conversation)} volver="" />
      ) : (
        <div className="community-chats-empty muted-note">
          Elige una conversación, o empieza una con «+» en la bandeja. Las directas son solo entre amistades.
        </div>
      )}
    </div>
  );
}
