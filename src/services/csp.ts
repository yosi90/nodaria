/*
 * Content-Security-Policy de Nodaria (`ecosistema-kit/ACCESO.md`, «Cabeceras de la web»). Se genera
 * aquí para cada entorno: Firebase Hosting sirve la de producción (`firebase.json`, comprobada en
 * `csp.test.ts`) y la vista previa contra QA (`npm run preview:qa`) la de QA.
 *
 * - La plataforma: el SDK (`script-src`), su API y el tiempo real (`connect-src`), la ventana de
 *   acceso y el canal de sesión (`frame-src`) y los avatares (`img-src`).
 * - Yosiftadísticas: su script y su envío (`estadisticas-kit/INTEGRACION.md`).
 * - Lo propio: la API de Nodaria, las imágenes en `data:` y `blob:` (retratos, mapas, exportar a
 *   PNG/SVG con html-to-image) y las fuentes empaquetadas.
 */

export type CspEnvironment = 'produccion' | 'qa';

const PLATFORM: Record<CspEnvironment, { sdk: string; api: string; ws: string }> = {
  produccion: {
    sdk: 'https://cuentas.yosiftware.es',
    api: 'https://cuentas-api.yosiftware.es',
    ws: 'wss://cuentas-ws.yosiftware.es',
  },
  qa: {
    sdk: 'https://qa-cuentas.yosiftware.es',
    api: 'https://qa-cuentas-api.yosiftware.es',
    ws: 'wss://qa-cuentas-ws.yosiftware.es',
  },
};

const STATS = 'https://estadisticas.yosiftware.es';
/** API de Nodaria de cada entorno; en QA va por el proxy del mismo origen. */
const NODARIA_API: Record<CspEnvironment, string[]> = {
  produccion: ['https://nodaria-api.yosiftware.es'],
  qa: [],
};

export function contentSecurityPolicy(env: CspEnvironment): string {
  const platform = PLATFORM[env];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", platform.sdk, STATS],
    'connect-src': ["'self'", ...NODARIA_API[env], platform.api, platform.ws, STATS],
    'frame-src': [platform.sdk],
    'img-src': ["'self'", 'data:', 'blob:', platform.api],
    'style-src': ["'self'"],
    'font-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
