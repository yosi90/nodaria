import { renamedFields, withRenamedFields } from './formulaRenames';
import { inheritedFields } from './inheritance';
import { isFieldLink, libraryField, ownFields, shareField } from './library';
import { effectiveFields, getSchema } from './selectors';
import { FIELD_LENS } from './structure';
import type { FieldDefinition, FieldValue, Project, ProjectView, Schema, SchemaField } from './types';
import { convertValue } from './valueConversion';

/*
 * Convertir en preforma un atributo que otros tipos repiten con la misma clave interna: además del original,
 * los de los demás tipos que se elijan pasan a vincular la misma preforma, en el sitio que ocupaban. La
 * preforma conserva el id del original, así que los valores de los demás se mueven a ese id (convertidos si
 * eran de otro tipo de dato) y todo lo que citaba sus ids (orden, ocultos, condiciones, ajustes SQL, filtros
 * del mapa, consultas y filas de tablas) pasa a citar la preforma. Las fórmulas que los nombraban por una
 * clave o etiqueta que cambia se reescriben. Todo va en un solo paso deshacible.
 */

const MAX_NEW_OPTIONS = 50;

const isEmpty = (v: FieldValue | undefined) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Atributos propios de los demás tipos con la misma clave que `fieldId` de `schemaId`. */
export function sameKeyFields(p: Project, schemaId: string, fieldId: string) {
  const schema = getSchema(p, schemaId);
  const field = schema && ownFields(schema).find(f => f.id === fieldId);
  if (!field) return [];
  return p.schemas
    .filter(s => s.id !== schemaId)
    .flatMap(s => ownFields(s).flatMap(f => (f.key === field.key ? [{ schema: s, field: f }] : [])));
}

/**
 * Pasa a la biblioteca el atributo `fieldId` de `schemaId` y sustituye por un vínculo a la misma preforma
 * los atributos propios de otros tipos indicados en `others` (sus ids).
 */
export function shareFieldWith(p: Project, schemaId: string, fieldId: string, others: string[]): Project {
  const shared = shareField(p, schemaId, fieldId);
  const preform = libraryField(shared, fieldId);
  if (!preform || shared === p) return p;
  const adopted = new Map<string, { field: FieldDefinition; schemaId: string }>();
  for (const s of shared.schemas)
    for (const f of ownFields(s)) if (others.includes(f.id)) adopted.set(f.id, { field: f, schemaId: s.id });
  const renamed = renamedFields(p, shared);
  if (!adopted.size) return withRenamedFields(p, shared, renamed);

  const target = withMissingOptions(
    p,
    preform,
    [...adopted.values()].map(a => a.field),
  );
  const to = (id: string) => (adopted.has(id) ? preform.id : id);
  const ids = (list: string[]) => [...new Set(list.map(to))];
  const moveValues = <T extends { values: Record<string, FieldValue> }>(owner: T): T => {
    const moved = Object.keys(owner.values).filter(id => adopted.has(id));
    if (!moved.length) return owner;
    const values = { ...owner.values };
    for (const id of moved) {
      const value = values[id];
      delete values[id];
      if (isEmpty(value)) continue;
      const converted = convertValue(p, value, adopted.get(id)!.field, target);
      if (converted === null || (target.type === 'select' && !target.options.includes(String(converted)))) continue;
      values[preform.id] = converted;
    }
    return { ...owner, values };
  };

  const next: Project = {
    ...shared,
    fieldLibrary: shared.fieldLibrary.map(f => remapConditions(f.id === preform.id ? target : f, to)),
    schemas: shared.schemas.map(s => adoptIn(s, adopted, target, to, ids)),
    nodes: shared.nodes.map(moveValues),
    relations: shared.relations.map(moveValues),
    view: remapView(shared.view, to, ids),
    lenses: shared.lenses.map(l => ({ ...l, view: remapView(l.view, to, ids) })),
    queries: shared.queries.map(q => ({
      ...q,
      conditions: q.conditions.map(c => (c.kind === 'field' ? { ...c, fieldId: to(c.fieldId) } : c)),
    })),
    tableData: Object.fromEntries(
      Object.entries(shared.tableData).map(([nodeId, data]) => [
        nodeId,
        {
          ...data,
          rows: data.rows.map(row => ({
            ...row,
            cells: Object.fromEntries(Object.entries(row.cells).map(([key, value]) => [remapCellKey(key, to), value])),
          })),
        },
      ]),
    ),
  };
  for (const [id, { field }] of adopted)
    if (field.key !== preform.key || field.label !== preform.label) renamed.set(id, preform.key);
  const owners = [schemaId, ...[...adopted.values()].map(a => a.schemaId)];
  return withRenamedFields(p, withoutInheritedLinks(p, next, preform.id, owners, to), renamed);
}

/**
 * Una preforma de lista suma las opciones de las listas adoptadas (con sus iconos y su presentación) y los
 * valores convertidos de los demás que todavía no son opciones (hasta 50).
 */
function withMissingOptions(p: Project, preform: FieldDefinition, fields: FieldDefinition[]): FieldDefinition {
  if (preform.type !== 'select') return preform;
  const lists = fields.filter(f => f.type === 'select');
  const options = [...new Set([...preform.options, ...lists.flatMap(f => f.options)])];
  const missing = new Set<string>();
  for (const owner of [...p.nodes, ...p.relations])
    for (const field of fields) {
      const value = owner.values[field.id];
      if (isEmpty(value)) continue;
      const converted = convertValue(p, value, field, preform);
      if (typeof converted === 'string' && !options.includes(converted)) missing.add(converted);
    }
  if (missing.size <= MAX_NEW_OPTIONS) options.push(...missing);
  if (options.length === preform.options.length) return preform;
  return {
    ...preform,
    options,
    optionIcons: Object.assign({}, ...lists.map(f => f.optionIcons), preform.optionIcons),
    optionDisplay: Object.assign({}, ...lists.map(f => f.optionDisplay), preform.optionDisplay),
  };
}

/** Un tipo con sus atributos adoptados cambiados por el vínculo, en su sitio, y los ids que los citaban al día. */
function adoptIn(
  s: Schema,
  adopted: Map<string, { field: FieldDefinition; schemaId: string }>,
  preform: FieldDefinition,
  to: (id: string) => string,
  ids: (list: string[]) => string[],
): Schema {
  const sqlOverrides = Object.fromEntries(Object.entries(s.sqlOverrides).map(([id, sql]) => [to(id), sql]));
  const fields = s.fields
    .map((f): SchemaField => {
      if (isFieldLink(f)) return f;
      if (!adopted.has(f.id)) return remapConditions(f, to);
      // Lo que esa columna tenía de SQL propio se queda como ajuste del tipo sobre la preforma.
      if (f.sql && !sqlOverrides[preform.id] && JSON.stringify(f.sql) !== JSON.stringify(preform.sql))
        sqlOverrides[preform.id] = f.sql;
      return { ref: preform.id };
    })
    .filter((f, i, all) => !isFieldLink(f) || all.findIndex(x => isFieldLink(x) && x.ref === f.ref) === i);
  return {
    ...s,
    fields,
    fieldOrder: ids(s.fieldOrder),
    hiddenFieldIds: ids(s.hiddenFieldIds),
    yieldFieldIds: ids(s.yieldFieldIds),
    sqlOverrides,
  };
}

function remapConditions(f: FieldDefinition, to: (id: string) => string): FieldDefinition {
  const visibleWhen = f.visibleWhen && { ...f.visibleWhen, fieldId: to(f.visibleWhen.fieldId) };
  const referenceWithin = f.referenceWithin && to(f.referenceWithin);
  const maxItemsBy = f.maxItemsBy && { ...f.maxItemsBy, fieldId: to(f.maxItemsBy.fieldId) };
  return visibleWhen?.fieldId === f.visibleWhen?.fieldId &&
    referenceWithin === f.referenceWithin &&
    maxItemsBy?.fieldId === f.maxItemsBy?.fieldId
    ? f
    : { ...f, visibleWhen, referenceWithin, maxItemsBy };
}

function remapView(view: ProjectView, to: (id: string) => string, ids: (list: string[]) => string[]): ProjectView {
  return {
    ...view,
    structureId: view.structureId?.startsWith(FIELD_LENS)
      ? FIELD_LENS + to(view.structureId.slice(FIELD_LENS.length))
      : view.structureId,
    hiddenReferenceFieldIds: ids(view.hiddenReferenceFieldIds),
    layoutFilters: Object.fromEntries(
      Object.entries(view.layoutFilters).map(([mode, filters]) => [
        mode,
        filters && { ...filters, hiddenReferenceFieldIds: ids(filters.hiddenReferenceFieldIds) },
      ]),
    ),
  };
}

/** Las celdas se guardan por id del atributo o, en las claves compuestas, `id:parte` (`tableData.ts`, `cellKey`). */
function remapCellKey(key: string, to: (id: string) => string) {
  const [id, ...rest] = key.split(':');
  return [to(id), ...rest].join(':');
}

/**
 * Un tipo que ya recibe la preforma de un ancestro no la vincula otra vez (sería un duplicado): se quita su
 * vínculo y se fija su orden de antes, para que el atributo siga en el sitio que tenía en ese tipo.
 */
function withoutInheritedLinks(
  before: Project,
  p: Project,
  preformId: string,
  schemaIds: string[],
  to: (id: string) => string,
): Project {
  let next = p;
  for (const id of new Set(schemaIds)) {
    const schema = getSchema(next, id);
    if (!schema?.fields.some(f => isFieldLink(f) && f.ref === preformId)) continue;
    if (!inheritedFields(next, schema).some(i => i.field.id === preformId)) continue;
    const fieldOrder = schema.fieldOrder.length
      ? schema.fieldOrder
      : [...new Set(effectiveFields(before, id, true).map(f => to(f.id)))];
    const fields = schema.fields.filter(f => !(isFieldLink(f) && f.ref === preformId));
    next = { ...next, schemas: next.schemas.map(s => (s.id === id ? { ...s, fields, fieldOrder } : s)) };
  }
  return next;
}
