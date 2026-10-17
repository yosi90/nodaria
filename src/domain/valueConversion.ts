import { GENDERS } from './constants';
import { isFieldLink } from './library';
import { normalizeName } from './notes';
import { nodeLabel } from './selectors';
import type { FieldDefinition, FieldValue, Project } from './types';

/*
 * Cambiar el tipo de un atributo convierte los valores guardados (PENDIENTES.md, «Cabos sueltos del
 * modelo»): lo convertible se convierte y lo que no, se borra. El editor avisa antes de cuánto se perdería
 * (`conversionPreview`) y todo va en un solo paso deshacible. Al pasar a lista, los valores que no son
 * opciones se añaden como opciones (`withConvertedValues`), para no perderlos.
 */

const isEmpty = (v: FieldValue | undefined) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const TRUE = new Set(['si', 'true', 'verdadero', '1', 'x', 'yes']);
const FALSE = new Set(['no', 'false', 'falso', '0']);
const DATE = /^\d{1,6}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-f]{3,8}$/i;
const MAX_NEW_OPTIONS = 50;

/** El valor como texto: números, sí/no, listas y referencias (por el título del nodo). */
function asText(p: Project, value: FieldValue, from: FieldDefinition): string | null {
  if (typeof value === 'string') {
    if (from.type === 'nodeRef') {
      const node = p.nodes.find(n => n.id === value);
      return node ? nodeLabel(p, node) : null;
    }
    if (from.type === 'gender') return GENDERS.find(([id]) => id === value)?.[1] ?? value;
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) {
    const items =
      from.type === 'nodeRefs'
        ? value.map(id => p.nodes.find(n => n.id === id)).flatMap(n => (n ? [nodeLabel(p, n)] : []))
        : value;
    return items.length ? items.join(', ') : null;
  }
  return null;
}

/** Elementos de una lista ordenada escrita como texto: uno por línea o, en una sola línea, separados por comas. */
export function listItems(text: string): string[] {
  return text
    .split(text.includes('\n') ? /\r?\n/ : ',')
    .map(t => t.trim())
    .filter(Boolean);
}

/** Un nodo por id o, si no, por título (sin mayúsculas ni acentos) entre los tipos admitidos. */
function resolveNode(p: Project, text: string, to: FieldDefinition): string | null {
  const byId = p.nodes.find(n => n.id === text);
  if (byId) return byId.id;
  const wanted = normalizeName(text);
  const found = p.nodes.find(
    n =>
      (!to.referenceTypeIds.length || to.referenceTypeIds.includes(n.typeId)) &&
      normalizeName(nodeLabel(p, n)) === wanted,
  );
  return found?.id ?? null;
}

/** El valor convertido al tipo nuevo, o `null` si no se puede convertir (se perdería). */
export function convertValue(
  p: Project,
  value: FieldValue,
  from: FieldDefinition,
  to: FieldDefinition,
): FieldValue | null {
  if (from.type === to.type) return value;
  const text = asText(p, value, from);
  switch (to.type) {
    case 'text':
    case 'longText':
    case 'url':
      return text;
    case 'number':
    case 'scale': {
      const number =
        typeof value === 'number'
          ? value
          : typeof value === 'boolean'
            ? Number(value)
            : Number(
                String(text ?? '')
                  .trim()
                  .replace(',', '.'),
              );
      if (text === null || !Number.isFinite(number) || String(text).trim() === '') return null;
      return to.type === 'scale' ? Math.min(5, Math.max(1, Math.round(number))) : number;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      const word = normalizeName(text ?? '');
      return TRUE.has(word) ? true : FALSE.has(word) ? false : null;
    }
    case 'date':
      return text && DATE.test(text.trim()) ? text.trim() : null;
    case 'select': {
      if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
      return text?.trim() || null;
    }
    case 'tags': {
      if (Array.isArray(value) && from.type !== 'nodeRefs') return [...new Set(value)];
      const items = (text ?? '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      return items.length ? items : null;
    }
    case 'list': {
      if (Array.isArray(value) && from.type !== 'nodeRefs') return value.length ? value : null;
      if (from.type === 'nodeRefs' && Array.isArray(value)) {
        const titles = value.map(id => p.nodes.find(n => n.id === id)).flatMap(n => (n ? [nodeLabel(p, n)] : []));
        return titles.length ? titles : null;
      }
      const items = listItems(text ?? '');
      return items.length ? items : null;
    }
    case 'nodeRef': {
      if (from.type === 'nodeRefs' && Array.isArray(value)) return value.length === 1 ? value[0] : null;
      return text ? resolveNode(p, text.trim(), to) : null;
    }
    case 'nodeRefs': {
      if (from.type === 'nodeRef' && typeof value === 'string') return [value];
      const ids = (text ?? '')
        .split(',')
        .map(t => resolveNode(p, t.trim(), to))
        .filter((id): id is string => Boolean(id));
      return ids.length ? ids : null;
    }
    case 'color':
      return text && COLOR.test(text.trim()) ? text.trim() : null;
    case 'gender': {
      const word = normalizeName(text ?? '');
      return GENDERS.find(([id, label]) => id && (id === word || normalizeName(label) === word))?.[0] ?? null;
    }
    case 'image':
      return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
    case 'computed':
      // Un calculado no usa lo guardado: se deja, por si se vuelve atrás.
      return value;
  }
}

/** Los atributos con definición propia del proyecto, por id: los de los tipos y los de la biblioteca. */
function definitions(p: Project) {
  const map = new Map<string, FieldDefinition>();
  for (const schema of p.schemas) for (const f of schema.fields) if (!isFieldLink(f)) map.set(f.id, f);
  for (const f of p.fieldLibrary) map.set(f.id, f);
  return map;
}

/** Cuántos valores de un atributo se convertirían y cuántos se perderían al pasar a otro tipo. */
export function conversionPreview(p: Project, from: FieldDefinition, to: FieldDefinition) {
  let converted = 0;
  let lost = 0;
  const owners = from.type === to.type ? [] : [...p.nodes, ...p.relations];
  for (const owner of owners) {
    const value = owner.values[from.id];
    if (isEmpty(value)) continue;
    if (convertValue(p, value!, from, to) === null) lost++;
    else converted++;
  }
  return { converted, lost };
}

/**
 * El proyecto `after` con los valores convertidos de los atributos que cambiaron de tipo desde `before`.
 * Lo que no se puede convertir se borra. Al pasar a lista, los valores que faltan entre las opciones se
 * añaden como opciones (hasta 50).
 */
export function withConvertedValues(before: Project, after: Project): Project {
  const old = definitions(before);
  const changed = [...definitions(after).values()].filter(f => {
    const previous = old.get(f.id);
    return previous && previous.type !== f.type;
  });
  if (!changed.length) return after;
  let next = after;
  for (const to of changed) {
    const from = old.get(to.id)!;
    let target = to;
    if (to.type === 'select') {
      // Las opciones que faltan, a partir de lo que se convertiría.
      const missing = new Set<string>();
      for (const owner of [...before.nodes, ...before.relations]) {
        const value = owner.values[to.id];
        if (isEmpty(value)) continue;
        const converted = convertValue(before, value!, from, to);
        if (typeof converted === 'string' && !to.options.includes(converted)) missing.add(converted);
      }
      if (missing.size && missing.size <= MAX_NEW_OPTIONS) target = { ...to, options: [...to.options, ...missing] };
    }
    const convert = <T extends { values: Record<string, FieldValue> }>(owner: T): T => {
      const value = owner.values[to.id];
      if (isEmpty(value)) return owner;
      const converted = convertValue(before, value!, from, target);
      const kept =
        target.type === 'select' && typeof converted === 'string' && !target.options.includes(converted)
          ? null
          : converted;
      const values = { ...owner.values };
      if (kept === null) delete values[to.id];
      else values[to.id] = kept;
      return { ...owner, values };
    };
    next = {
      ...next,
      nodes: next.nodes.map(convert),
      relations: next.relations.map(convert),
      schemas:
        target === to
          ? next.schemas
          : next.schemas.map(s => ({
              ...s,
              fields: s.fields.map(f => (!isFieldLink(f) && f.id === to.id ? target : f)),
            })),
      fieldLibrary: target === to ? next.fieldLibrary : next.fieldLibrary.map(f => (f.id === to.id ? target : f)),
    };
  }
  return next;
}
