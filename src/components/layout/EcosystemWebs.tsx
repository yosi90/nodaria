declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** El botón de las webs del ecosistema, del SDK (`ecosistema-kit/ACCESO.md`, «Las webs del ecosistema»). */
      'yosi-webs': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'nueva-pestana'?: string;
      };
    }
  }
}

/**
 * La cuadrícula de las webs y apps de Yosiftware, obligatoria en la cabecera junto a la cuenta (kit 1.45).
 * La pinta el SDK con lo que da `GET /v1/webs`; aquí solo se coloca y se le da el aspecto de los botones
 * de la barra (`components.css`, `yosi-webs::part(boton)`). Las webs se abren en otra pestaña para no
 * dejar a medias el trabajo en Nodaria. Sin SDK (sin conexión con la plataforma) no se ve nada.
 */
export function EcosystemWebs() {
  return <yosi-webs className="ecosystem-webs" nueva-pestana="" />;
}
