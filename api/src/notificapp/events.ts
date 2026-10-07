import { type CreatedRequest, externalIdOf, type OutboxEvent } from '../requests/model.ts';

/** Tipo de aviso declarado en `notificapp-plugin/manifest.json`. */
export const REQUEST_EVENT_KIND = 'nodaria_request';

/** Aviso de una petición nueva: el cuerpo lleva el texto completo, como pide Notificapp. */
export function requestEvent({ request, author }: CreatedRequest): OutboxEvent {
  const who =
    [author.displayName, author.email && `<${author.email}>`].filter(Boolean).join(' ') || 'Usuario sin nombre';
  const label = request.kind === 'idea' ? 'Idea' : 'Error';
  return {
    externalId: externalIdOf(request.id),
    payload: {
      externalId: externalIdOf(request.id),
      kind: REQUEST_EVENT_KIND,
      title: request.kind === 'idea' ? 'Nueva idea en Nodaria' : 'Nuevo error en Nodaria',
      body: `${label} #${request.id}: ${request.title}\nDe: ${who}\n\n${request.body}`,
    },
  };
}
