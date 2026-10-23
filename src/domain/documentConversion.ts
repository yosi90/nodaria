import { isFieldLink } from './library';
import { createField } from './factories';
import { removeNodes } from './operations';
import { getSchema, nodeLabel } from './selectors';
import { dataTables, rowsOf, type DataTable } from './tableData';
import type { FieldDefinition, Project } from './types';

/*
 * Pasar un diseño de tablas a documentos (docs/roadmaps/ROADMAP_NOSQL.md, «Opcional»): las tablas de SQL
 * Server o Db2 elegidas pasan a ser colecciones de MongoDB o de Firestore. Para cada una se sugiere qué hacer
 * según sus claves foráneas, como se suele modelar en documentos:
 *
 * - **Incrustarla en su tabla padre** cuando sus filas solo existen con ese padre (la clave foránea no admite
 *   nulos y es parte de su clave primaria o se borra en cascada, como las líneas de un pedido) y ninguna otra
 *   tabla la apunta. Pasa a ser un subdocumento (`Schema.embedded`): el padre gana una referencia hacia él
 *   (una lista si son varias filas por padre, un objeto si es uno a uno) y la clave foránea hacia el padre
 *   sobra, porque ya está dentro.
 * - **Colección con referencias** en los demás casos: sus claves foráneas guardan el id del documento.
 */

export type DocumentEngine = 'mongodb' | 'firestore';

export interface ConversionSuggestion {
  nodeId: string;
  name: string;
  /** Tabla padre en la que se puede incrustar (si se puede), con la clave foránea que lleva a ella. */
  parent: { nodeId: string; name: string; fieldId: string; many: boolean } | null;
  /** Lo que se sugiere y por qué, para enseñarlo. */
  embed: boolean;
  reason: string;
}

export interface ConversionChoice {
  nodeId: string;
  /** Incrustar en su padre (si la sugerencia tiene padre) o dejarla como colección. */
  embed: boolean;
}

/** Las claves foráneas que apuntan a cada tabla, desde cualquier tabla del proyecto. */
function incoming(tables: DataTable[]) {
  const map = new Map<string, Set<string>>();
  tables.forEach(t =>
    t.columns.forEach(c => {
      if (!c.fk || c.fk.nodeId === t.node.id) return;
      map.set(c.fk.nodeId, new Set([...(map.get(c.fk.nodeId) ?? []), t.node.id]));
    }),
  );
  return map;
}

/** Qué hacer con cada tabla elegida, con el motivo. */
export function suggestConversion(p: Project, nodeIds: string[]): ConversionSuggestion[] {
  const tables = dataTables(p);
  const chosen = new Set(nodeIds);
  const pointedBy = incoming(tables);
  const byNode = new Map(tables.map(t => [t.node.id, t]));
  const suggestions: ConversionSuggestion[] = nodeIds
    .map(id => byNode.get(id))
    .filter((t): t is DataTable => Boolean(t))
    .map(t => {
      const name = t.name;
      // Una sola clave foránea «de pertenencia» hacia una tabla que también se pasa a documentos.
      const owning = [...new Set(t.columns.filter(c => c.fk && c.fk.nodeId !== t.node.id).map(c => c.field.id))]
        .map(fieldId => t.columns.filter(c => c.field.id === fieldId))
        .filter(parts => {
          const first = parts[0];
          const target = first.fk!.nodeId;
          return (
            chosen.has(target) &&
            parts.every(c => !c.sql.nullable || c.sql.primaryKey) &&
            (parts.every(c => c.sql.primaryKey) || first.sql.onDelete === 'CASCADE')
          );
        });
      const others = [...(pointedBy.get(t.node.id) ?? [])];
      const sharedType = p.nodes.filter(n => n.typeId === t.node.typeId).length > 1;
      if (owning.length !== 1 || others.length || sharedType) {
        const reason = others.length
          ? `La apunta${others.length === 1 ? '' : 'n'} ${others.map(o => byNode.get(o)?.name ?? '').join(', ')}: mejor como colección, con referencias.`
          : sharedType
            ? 'Su tipo tiene otras tablas: se queda como colección.'
            : owning.length > 1
              ? 'Pertenece a varias tablas a la vez: mejor como colección.'
              : 'No depende de otra tabla: es una colección.';
        const parent = owning.length === 1 && !sharedType ? parentOf(t, owning[0], byNode) : null;
        return { nodeId: t.node.id, name, parent, embed: false, reason };
      }
      const parent = parentOf(t, owning[0], byNode);
      const how = owning[0].every(c => c.sql.primaryKey)
        ? 'su clave es parte de su clave primaria'
        : 'se borra en cascada';
      return {
        nodeId: t.node.id,
        name,
        parent,
        embed: true,
        reason: `Sus filas solo existen con su ${parent.name} (${how}) y nadie más la apunta: dentro de ${parent.name}${parent.many ? ', como lista' : ''}.`,
      };
    });
  // Una colección a la que solo apuntan las tablas que se le incrustan: se dice así, no «la apuntan».
  return suggestions.map(s => {
    if (s.embed) return s;
    const others = [...(pointedBy.get(s.nodeId) ?? [])];
    const inside = suggestions.filter(c => c.embed && c.parent?.nodeId === s.nodeId);
    if (!others.length || others.some(o => !inside.some(c => c.nodeId === o))) return s;
    const names = inside.map(c => c.name).join(', ');
    return { ...s, reason: `Es una colección; ${names} ${inside.length === 1 ? 'va' : 'van'} dentro.` };
  });
}

function parentOf(t: DataTable, parts: DataTable['columns'], byNode: Map<string, DataTable>) {
  const target = byNode.get(parts[0].fk!.nodeId)!;
  // Uno a uno si la clave foránea es única o es la clave primaria entera de la tabla.
  const keys = t.columns.filter(c => c.sql.primaryKey);
  const oneToOne =
    parts.every(c => c.sql.unique) || (keys.length === parts.length && parts.every(c => c.sql.primaryKey));
  return { nodeId: target.node.id, name: target.name, fieldId: parts[0].field.id, many: !oneToOne };
}

/** Una clave que no esté ya en el tipo (lineas, lineas_2…). */
function freeKey(existing: FieldDefinition[], base: string) {
  const taken = new Set(existing.map(f => f.key.toLowerCase()));
  let key = base;
  for (let i = 2; taken.has(key.toLowerCase()); i++) key = `${base}_${i}`;
  return key;
}

/**
 * Pasa las tablas a colecciones de `engine` según lo elegido. Devuelve el proyecto y los avisos (filas de
 * ejemplo que se pierden, lo que no se pudo incrustar).
 */
export function convertToDocuments(p: Project, engine: DocumentEngine, choices: ConversionChoice[]) {
  const suggestions = new Map(
    suggestConversion(
      p,
      choices.map(c => c.nodeId),
    ).map(s => [s.nodeId, s]),
  );
  const warnings: string[] = [];
  const rows = choices.reduce((n, c) => n + rowsOf(p, c.nodeId).length, 0);
  if (rows)
    warnings.push(
      rows === 1
        ? 'La fila de ejemplo de estas tablas no pasa a los documentos.'
        : `Las ${rows} filas de ejemplo de estas tablas no pasan a los documentos.`,
    );

  let next = p;
  const embedded = new Set<string>();
  const schemaOf = (nodeId: string) => next.nodes.find(n => n.id === nodeId)?.typeId;

  // Primero el motor de todas: así las referencias entre ellas ya son de documentos.
  const typeIds = new Set(choices.map(c => schemaOf(c.nodeId)).filter((id): id is string => Boolean(id)));
  next = { ...next, schemas: next.schemas.map(s => (typeIds.has(s.id) ? { ...s, table: true, dbEngine: engine } : s)) };

  choices.forEach(choice => {
    const suggestion = suggestions.get(choice.nodeId);
    if (!choice.embed) return;
    if (!suggestion?.parent) {
      warnings.push(
        `${suggestion?.name ?? 'Una tabla'}: no tiene una tabla padre donde incrustarla; queda como colección.`,
      );
      return;
    }
    const childType = schemaOf(choice.nodeId);
    const parentType = schemaOf(suggestion.parent.nodeId);
    if (!childType || !parentType) return;
    embedded.add(choice.nodeId);
    const child = getSchema(next, childType)!;
    const parent = getSchema(next, parentType)!;
    const fkField = suggestion.parent.fieldId;
    // El hijo es un subdocumento y pierde la clave hacia el padre (ya está dentro); si es heredada, se oculta.
    const own = child.fields.some(f => !isFieldLink(f) && f.id === fkField);
    const subdocument = {
      ...child,
      embedded: true,
      fields: own ? child.fields.filter(f => isFieldLink(f) || f.id !== fkField) : child.fields,
      hiddenFieldIds: own ? child.hiddenFieldIds : [...new Set([...child.hiddenFieldIds, fkField])],
    };
    const parentFields = parent.fields.filter((f): f is FieldDefinition => !isFieldLink(f));
    const label = nodeLabel(
      next,
      next.nodes.find(n => n.id === choice.nodeId)!,
    );
    const reference: FieldDefinition = {
      ...createField(),
      key: freeKey(parentFields, label.toLowerCase().replace(/[^a-z0-9_áéíóúüñ]+/gi, '_')),
      label,
      type: suggestion.parent.many ? 'nodeRefs' : 'nodeRef',
      referenceTypeIds: [child.id],
      description: `Antes, la tabla ${label}.`,
    };
    next = {
      ...next,
      schemas: next.schemas.map(s =>
        s.id === child.id ? subdocument : s.id === parent.id ? { ...parent, fields: [...parent.fields, reference] } : s,
      ),
    };
  });
  // Los subdocumentos no tienen colección propia: su nodo (la tabla) se va, con lo que apuntaba a él. Un
  // subdocumento dentro de otro (las devoluciones de una línea de un pedido) también vale.
  next = removeNodes(next, embedded);
  // Las filas de ejemplo son de las tablas relacionales: las de las convertidas se quitan.
  const tableData = { ...next.tableData };
  choices.forEach(c => delete tableData[c.nodeId]);
  next = { ...next, tableData };
  return { project: next, embedded: embedded.size, warnings };
}
