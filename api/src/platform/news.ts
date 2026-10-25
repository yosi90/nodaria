import type { AppConfig } from '../config.ts';
import { PlatformError, platformRequest } from './http.ts';

/*
 * Las novedades de Yosiftware (`ecosistema-kit/NOVEDADES.md`, «Las novedades de Yosiftware», kit 1.45,
 * obligatorio): cada publicación en producción que la gente nota se anuncia en el feed de la cuenta
 * oficial Yosiftware, desde el backend y con la credencial de servicio de Nodaria. El navegador nunca
 * publica. Se lanza a mano al publicar (`npm run anunciar -- …`, `src/tools/cli.ts`).
 */

export const ANNOUNCEMENT_KINDS = [
  'actualizacion',
  'peticion',
  'arreglo',
  'app_nueva',
  'app_disponible',
  'aviso',
] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export interface Announcement {
  tipo: AnnouncementKind;
  /** Estable (la fecha y la tarea): con el mismo se corrige el anuncio en vez de repetirlo. */
  idExterno: string;
  /** Una frase corta, en español, sin jerga y con el nombre de la web. Hasta 280 caracteres. */
  texto: string;
  /** Opcional: una dirección `https` de Nodaria o de `yosiftware.es`. */
  enlace?: string;
}

/** Por qué no se puede anunciar así, o `null` si cumple las reglas del kit. */
export function announcementProblem(a: Announcement): string | null {
  if (!ANNOUNCEMENT_KINDS.includes(a.tipo)) return `Tipo desconocido: usa ${ANNOUNCEMENT_KINDS.join(', ')}.`;
  if (!/^[\w.:-]{1,100}$/.test(a.idExterno))
    return 'El idExterno tiene que ser corto y estable (letras, números, . : _ -).';
  const texto = a.texto.trim();
  if (!texto || texto.length > 280) return 'El texto tiene que tener entre 1 y 280 caracteres.';
  if (!/nodaria/i.test(texto)) return 'El texto tiene que llevar el nombre de la web (Nodaria).';
  if (/<[^>]+>/.test(texto)) return 'El texto no puede llevar HTML.';
  if (a.enlace !== undefined) {
    let url: URL;
    try {
      url = new URL(a.enlace);
    } catch {
      return 'El enlace no es una dirección válida.';
    }
    if (url.protocol !== 'https:' || !(url.hostname === 'yosiftware.es' || url.hostname.endsWith('.yosiftware.es')))
      return 'El enlace tiene que ser una dirección https de yosiftware.es.';
  }
  return null;
}

/** Anuncia (o corrige, con el mismo `idExterno`) una novedad de Yosiftware. Devuelve lo que responde la plataforma. */
export async function announceToYosiftware(
  config: AppConfig['platform'],
  announcement: Announcement,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const problem = announcementProblem(announcement);
  if (problem) throw new PlatformError(400, 'anuncio_no_valido', problem);
  return platformRequest(config, 'POST', '/v1/servicio/novedades/yosiftware', {
    body: { ...announcement, texto: announcement.texto.trim() },
    fetch: fetchImpl,
  });
}
