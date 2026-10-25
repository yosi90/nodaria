import { readFile } from 'node:fs/promises';
import type { AppConfig } from '../config.ts';

/*
 * Un solo cliente para lo que el backend pide a los servicios de Yosiftware: la plataforma (feed,
 * espacios, novedades, moderación, pasarela de IA) y Notificapp. La credencial (solo el token, fuera de
 * Git) se lee del archivo en cada llamada, va en `Authorization` con el `User-Agent` de Nodaria, y los
 * errores llegan como `PlatformError` con el código del servicio.
 */

export const USER_AGENT = 'nodaria-api/1.0';

/** Error de la plataforma (o de Notificapp) en su formato común (`code`, `error`). */
export class PlatformError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** La credencial guardada en el archivo, o `null` si no está o está vacío. */
export async function readToken(file: string): Promise<string | null> {
  try {
    return (await readFile(file, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/** La credencial de servicio de la plataforma; sin ella, `PlatformError` 503 (se puede reintentar). */
export async function serviceToken(file: string): Promise<string> {
  const token = await readToken(file);
  if (!token) throw new PlatformError(503, 'sin_credencial', 'Falta la credencial de servicio de la plataforma.');
  return token;
}

export interface ServiceCall {
  body?: unknown;
  /** Cabeceras propias de la ruta (`X-Yosi-Cuenta`…). */
  headers?: Record<string, string>;
  /** Quién responde, para el mensaje de un error sin texto. */
  service?: string;
  fetch?: typeof fetch;
}

/**
 * Llama a `url` con la credencial dada y devuelve el JSON de la respuesta (`null` si no trae). Una
 * respuesta de error lanza `PlatformError`: con el formato de la plataforma (`{ code, error }`) o con el
 * de Notificapp (`{ error, message }`).
 */
export async function serviceRequest(
  url: string,
  token: string,
  method: string,
  { body, headers, service = 'La plataforma', fetch: fetchImpl = fetch }: ServiceCall = {},
): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : typeof data?.error === 'string' ? data.error : 'error';
    const message =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `${service} respondió ${response.status}.`;
    throw new PlatformError(response.status, code, message);
  }
  return data;
}

/** Una ruta de servicio de la plataforma (`/v1/servicio/…`) con la credencial de servicio de Nodaria. */
export async function platformRequest(
  platform: Pick<AppConfig['platform'], 'api' | 'serviceTokenFile'>,
  method: string,
  route: string,
  call?: ServiceCall,
) {
  return serviceRequest(`${platform.api}${route}`, await serviceToken(platform.serviceTokenFile), method, call);
}
