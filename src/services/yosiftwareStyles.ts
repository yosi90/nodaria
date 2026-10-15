/*
 * Aspecto de Nodaria en lo que pinta el SDK de Yosiftware: las ventanas de entrar, perfil y reportar
 * y el panel de privacidad (`ecosistema-kit/ESTILOS.md`, «La hoja de la web»). La hoja se aplica con
 * `yosiftware.estilos({ css })`: dentro de las ventanas de la plataforma no existen las variables de
 * Nodaria, así que lleva los valores de `tokens.css` de cada tema. La letra se pide con dirección
 * absoluta a la propia web (un `*.yosiftware.es`, lo único que las ventanas cargan). No se esconde ni
 * se disfraza la marca, las normas ni los avisos de la plataforma: solo cambia su aspecto.
 */

const LIGHT = {
  principal: '#5b45d6',
  principalTexto: '#ffffff',
  principalSuave: '#5b45d61a',
  fondo: '#ffffff',
  fondoSuave: '#f9f7f2',
  fondoPagina: '#efebe2',
  texto: '#1f1d1a',
  textoSuave: '#5c574e',
  borde: '#ddd6c8',
  bordeFuerte: '#c3baa7',
  exito: '#1f7e4a',
  error: '#c3303d',
  errorSuave: '#c3303d14',
  sombra: '0 22px 60px #3a301f2e, 0 4px 12px #3a301f14',
};

const DARK: typeof LIGHT = {
  principal: '#a194ff',
  principalTexto: '#14112a',
  principalSuave: '#a194ff1f',
  fondo: '#1b1f27',
  fondoSuave: '#14171d',
  fondoPagina: '#0d0f13',
  texto: '#eceef3',
  textoSuave: '#a3abba',
  borde: '#282e39',
  bordeFuerte: '#3a4250',
  exito: '#72d49d',
  error: '#ff7c87',
  errorSuave: '#ff7c871a',
  sombra: '0 24px 70px #000b, 0 4px 14px #0007',
};

const variables = (c: typeof LIGHT) => `
  --yosi-color-principal: ${c.principal};
  --yosi-color-principal-texto: ${c.principalTexto};
  --yosi-color-principal-suave: ${c.principalSuave};
  --yosi-color-fondo: ${c.fondo};
  --yosi-color-fondo-suave: ${c.fondoSuave};
  --yosi-color-fondo-pagina: ${c.fondoPagina};
  --yosi-color-texto: ${c.texto};
  --yosi-color-texto-suave: ${c.textoSuave};
  --yosi-color-borde: ${c.borde};
  --yosi-color-borde-fuerte: ${c.bordeFuerte};
  --yosi-color-acento: ${c.principal};
  --yosi-color-acento-suave: ${c.principalSuave};
  --yosi-color-exito: ${c.exito};
  --yosi-color-error: ${c.error};
  --yosi-color-error-suave: ${c.errorSuave};
  --nodaria-sombra: ${c.sombra};`;

/** Hoja de Nodaria para el SDK; `origin` es el de la web (para la letra). */
export function platformStyles(origin: string): string {
  return `
@font-face {
  font-family: 'Nodaria Inter';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('${origin}/fonts/inter-latin-wght-normal.woff2') format('woff2-variations');
}
[part~='raiz'] {${variables(LIGHT)}
  --yosi-fuente: 'Nodaria Inter', 'Inter Variable', Inter, ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
  --yosi-radio: 9px;
  --yosi-radio-ventana: 18px;
  font-family: var(--yosi-fuente);
}
[part~='raiz'][data-tema='oscuro'] {${variables(DARK)}
}
/* Las ventanas de la plataforma no leen las variables --yosi-color-*: se pinta cada pieza por su nombre. */
[part~='tarjeta'],
[part~='panel'] {
  font-family: var(--yosi-fuente);
  background: var(--yosi-color-fondo);
  color: var(--yosi-color-texto);
  border-color: var(--yosi-color-borde);
  box-shadow: var(--nodaria-sombra);
}
[part~='titulo'],
[part~='etiqueta'] {
  color: var(--yosi-color-texto);
}
[part~='ayuda'],
[part~='separador'] {
  color: var(--yosi-color-texto-suave);
}
[part~='boton'] {
  font-family: var(--yosi-fuente);
  font-weight: 600;
  border-radius: var(--yosi-radio);
}
[part~='boton'][part~='principal'] {
  background: var(--yosi-color-principal);
  border-color: var(--yosi-color-principal);
  color: var(--yosi-color-principal-texto);
}
[part~='boton'][part~='secundario'],
[part~='boton'][part~='google'] {
  background: var(--yosi-color-fondo);
  border-color: var(--yosi-color-borde-fuerte);
  color: var(--yosi-color-texto);
}
[part~='enlace'] {
  color: var(--yosi-color-principal);
}
[part~='campo'] {
  font-family: var(--yosi-fuente);
  border-radius: var(--yosi-radio);
  background: var(--yosi-color-fondo-suave);
  border-color: var(--yosi-color-borde);
  color: var(--yosi-color-texto);
}
[part~='campo']:focus {
  border-color: var(--yosi-color-principal);
  outline: 3px solid var(--yosi-color-principal-suave);
}
[part~='casilla'],
[part~='interruptor'] {
  accent-color: var(--yosi-color-principal);
}
[part~='segmento'][part~='activo'],
[part~='opcion'][part~='activo'],
[part~='chip'][part~='activo'] {
  background: var(--yosi-color-principal-suave);
  border-color: var(--yosi-color-principal);
  color: var(--yosi-color-principal);
}
[part~='ventana']::backdrop {
  background: rgb(13 15 19 / 0.45);
  backdrop-filter: blur(2px);
}
`;
}
