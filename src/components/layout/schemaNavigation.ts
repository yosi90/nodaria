import type { SchemaKind } from '../../domain/types';
import type { View } from '../../state/navigation';

/** Espera al montaje de la vista antes de activar uno de sus controles existentes. */
export function afterViewMount(action: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(action));
}
export function openSchemaDefinition(id: string, kind: SchemaKind, setView: (view: View) => void) {
  setView(kind === 'entity' ? 'schema' : 'relations');
  afterViewMount(() =>
    [...document.querySelectorAll<HTMLElement>('[data-type-id]')].find(el => el.dataset.typeId === id)?.click(),
  );
}
