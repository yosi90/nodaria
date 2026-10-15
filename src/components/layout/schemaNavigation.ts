import type { SchemaKind } from '../../domain/types';
import type { View } from '../../state/navigation';

/** Espera al montaje de la vista antes de activar uno de sus controles existentes. */
export function afterViewMount(action: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(action));
}
/** Evento que la lista de tipos escucha para seleccionar uno (desplegando su rama y su carpeta). */
export const OPEN_TYPE_EVENT = 'nodaria-open-type';

export function openSchemaDefinition(id: string, kind: SchemaKind, setView: (view: View) => void) {
  setView(kind === 'entity' ? 'schema' : 'relations');
  afterViewMount(() => window.dispatchEvent(new CustomEvent(OPEN_TYPE_EVENT, { detail: id })));
}
