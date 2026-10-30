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

/**
 * Lleva a la fila de un atributo (de un tipo o de la biblioteca) y la resalta un momento. La vista y el tipo
 * se montan en los fotogramas siguientes, así que se busca la fila durante un segundo como mucho. Con
 * `schemaId` se busca dentro de ese tipo: una preforma tiene el mismo id en todos los que la vinculan, y el
 * tipo que estaba abierto podría tenerla también.
 */
export function revealField(fieldId: string, schemaId?: string) {
  const started = performance.now();
  const scope = schemaId ? `[data-schema-id="${CSS.escape(schemaId)}"] ` : '';
  const look = () => {
    const row = document.querySelector<HTMLElement>(`.app-body ${scope}[data-field-id="${CSS.escape(fieldId)}"]`);
    if (!row) {
      if (performance.now() - started < 1000) requestAnimationFrame(look);
      return;
    }
    row.scrollIntoView({ block: 'center' });
    row.classList.remove('revealed');
    void row.offsetWidth;
    row.classList.add('revealed');
    window.setTimeout(() => row.classList.remove('revealed'), 1600);
  };
  afterViewMount(look);
}
