import type { FieldDefinition, FieldValue } from '../domain/types';
import { apiRequest } from './api';

/*
 * Comentarios y sugerencias de los proyectos de grupo (docs/roadmaps/ROADMAP_COLABORACION.md, hito 5).
 * Viven en la API de Nodaria, aparte del documento: quien solo revisa puede comentar y sugerir sin
 * cambiar el proyecto. Aceptar una sugerencia aplica el cambio en el proyecto, como cualquier edición.
 */

export type CommentState = 'abierto' | 'resuelto' | 'aceptado' | 'rechazado';

export interface Suggestion {
  fieldId: string;
  value: FieldValue;
}

export interface GroupComment {
  id: number;
  projectId: string;
  nodeId: string | null;
  author: string;
  body: string;
  suggestion: Suggestion | null;
  state: CommentState;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const base = (group: string, project: string) =>
  `/api/grupos/${encodeURIComponent(group)}/proyectos/${encodeURIComponent(project)}/comentarios`;

export const listComments = (token: string, group: string, project: string) =>
  apiRequest<{ comments: GroupComment[] }>('GET', base(group, project), token).then(r => r.comments);
export const createComment = (
  token: string,
  group: string,
  project: string,
  comment: { nodeId: string | null; body: string; suggestion: Suggestion | null },
) => apiRequest<GroupComment>('POST', base(group, project), token, comment);
export const setCommentState = (token: string, group: string, project: string, id: number, state: CommentState) =>
  apiRequest<GroupComment>('PATCH', `${base(group, project)}/${id}`, token, { state });
export const deleteComment = (token: string, group: string, project: string, id: number) =>
  apiRequest<{ id: number }>('DELETE', `${base(group, project)}/${id}`, token);

/** Atributos sobre los que se puede sugerir un valor: los que se escriben como texto, número o elección. */
export const SUGGESTIBLE = new Set<FieldDefinition['type']>([
  'text',
  'longText',
  'number',
  'url',
  'date',
  'select',
  'scale',
]);

/** El valor sugerido, ya con el tipo del atributo (texto escrito en el formulario). `null` si no vale. */
export function suggestedValue(field: FieldDefinition, text: string): FieldValue | null {
  const trimmed = text.trim();
  if (field.type === 'number' || field.type === 'scale') {
    if (!trimmed) return null;
    const number = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(number)) return null;
    return field.type === 'scale' ? Math.min(5, Math.max(1, Math.round(number))) : number;
  }
  if (field.type === 'select') return field.options.includes(trimmed) ? trimmed : null;
  if (field.type === 'date') return /^\d{1,6}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  return text;
}
