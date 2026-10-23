declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** La ventana flotante del chat de la plataforma (`ecosistema-kit/CHAT.md`), del SDK. */
      'yosi-chat': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

/**
 * La ventana flotante de los chats (`<yosi-chat>`, del SDK): un botón con lo no leído que abre el listado
 * (directas, grupos, las conversaciones de los grupos de trabajo y las de cualquier otra web) y cada
 * conversación en su ventana, que se arrastra por toda la página, cambia de tamaño y se minimiza a una
 * burbuja. Cómo la deja la persona lo guarda la plataforma en su cuenta, para esta web; Nodaria no guarda
 * nada. Sin sesión no enseña nada; en el móvil es una vista a pantalla completa.
 */
export function FloatingChat() {
  return <yosi-chat className="nodaria-chat" />;
}
