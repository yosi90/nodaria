import { engineOf, tableColumns } from './database';
import { formatDateValue, isStandardCalendar } from './calendar';
import { isRealDate } from './agenda';
import { GENDERS } from './constants';
import { allFields, fieldValue, getSchema, inheritedSchemas, nodeLabel, relationRole } from './selectors';
import { stripAccents } from './text';
import type { FieldDefinition, FieldValue, Node, Project } from './types';

/*
 * Neo4j (docs/roadmaps/ROADMAP_NOSQL.md). El modelo de Nodaria ya es un grafo: tipos de entidad = etiquetas,
 * tipos de relación = tipos de relación, atributos = propiedades. Dos exportaciones, en Cypher:
 *
 * - `neo4jSchema`: el esquema de los tipos de base de datos con motor Neo4j (un nodo = una etiqueta, como un
 *   nodo tabla es una tabla): restricciones de unicidad e índices, y en comentarios lo que solo admite la
 *   edición Enterprise (existencia y tipo de propiedad) y las relaciones que se esperan.
 * - `projectCypher`: el grafo entero de cualquier proyecto, con sus nodos, relaciones, referencias y la
 *   jerarquía, para explorarlo en Neo4j. Se puede repetir: usa MERGE sobre `nodaria_id`.
 */

/** Nombre entre comillas invertidas, como pide Cypher para cualquier texto. */
const name = (text: string) => `\`${text.replace(/`/g, '``')}\``;
/** Nombre de restricción o índice: solo letras, números y guiones bajos. */
const slug = (text: string) =>
  stripAccents(text)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'x';
/** Tipo de relación al estilo de Neo4j: «Trabaja en» → TRABAJA_EN. */
export const relationType = (text: string) => slug(text).toUpperCase() || 'RELACION';
const literal = (value: string | number | boolean | string[]): string =>
  Array.isArray(value)
    ? `[${value.map(v => literal(v)).join(', ')}]`
    : typeof value === 'string'
      ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
      : String(value);

export const neo4jLabels = (p: Project) => p.nodes.filter(n => engineOf(p, n.typeId) === 'neo4j');

export function neo4jSchema(p: Project, generatedAt = new Date()): string {
  const out = [
    `// Esquema de «${p.name}» para Neo4j, generado por Nodaria el ${generatedAt.toISOString().slice(0, 10)}.`,
    '// Ejecútalo en Neo4j Browser o con cypher-shell. Se puede repetir (IF NOT EXISTS).',
    '',
  ];
  const labels = neo4jLabels(p);
  const labelOf = new Map(labels.map(n => [n.id, nodeLabel(p, n).trim() || 'SinNombre']));
  for (const node of labels) {
    const label = labelOf.get(node.id)!;
    out.push(`// :${label}`);
    const enterprise: string[] = [];
    for (const c of tableColumns(p, node.typeId)) {
      const prop = c.field.key || c.field.label;
      if (c.reference) continue;
      const id = `${slug(label)}_${slug(prop)}`;
      if (c.sql.unique)
        out.push(
          `CREATE CONSTRAINT ${id}_unico IF NOT EXISTS FOR (n:${name(label)}) REQUIRE n.${name(prop)} IS UNIQUE;`,
        );
      else if (c.sql.indexed) out.push(`CREATE INDEX ${id} IF NOT EXISTS FOR (n:${name(label)}) ON (n.${name(prop)});`);
      if (!c.sql.nullable)
        enterprise.push(
          `// CREATE CONSTRAINT ${id}_existe IF NOT EXISTS FOR (n:${name(label)}) REQUIRE n.${name(prop)} IS NOT NULL;`,
        );
      if (!c.docDeduced && c.docType)
        enterprise.push(
          `// CREATE CONSTRAINT ${id}_tipo IF NOT EXISTS FOR (n:${name(label)}) REQUIRE n.${name(prop)} IS :: ${c.docType.toUpperCase()};`,
        );
    }
    if (enterprise.length) out.push('// Solo en Neo4j Enterprise:', ...enterprise);
    // Las referencias son relaciones: se listan las que se esperan desde esta etiqueta.
    const references = tableColumns(p, node.typeId).filter(c => c.reference && c.target);
    const targets = (c: (typeof references)[number]) => {
      const raw = node.values[c.field.id];
      const ids = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
      const named = ids.map(id => labelOf.get(id)).filter(Boolean);
      return named.length ? named : [c.target!.name];
    };
    references.forEach(c =>
      targets(c).forEach(target =>
        out.push(`// (:${label})-[:${relationType(c.field.key || c.field.label)}]->(:${target})`),
      ),
    );
    p.relations
      .filter(r => r.sourceId === node.id && labelOf.has(r.targetId))
      .forEach(r =>
        out.push(
          `// (:${label})-[:${relationType(getSchema(p, r.typeId)?.name ?? 'RELACION')}]->(:${labelOf.get(r.targetId)})`,
        ),
      );
    out.push('');
  }
  if (!labels.length) out.push('// El proyecto no tiene etiquetas de Neo4j.');
  return out.join('\n');
}

/**
 * Una fecha: con el calendario real, una fecha de Neo4j (`date('1995-04-02')`), que se puede comparar y
 * restar; con un calendario del mundo, el texto legible («3 de Brumal de 1043»).
 */
function dateValue(p: Project, value: FieldValue): string {
  if (isStandardCalendar(p.calendar) && typeof value === 'string' && isRealDate(value)) return `date('${value}')`;
  return literal(formatDateValue(p.calendar, value) || String(value));
}

/** Valor de una propiedad en Cypher, o `null` si no se exporta (vacío, imagen o referencia). */
function propertyValue(p: Project, node: Node, field: FieldDefinition, fields: FieldDefinition[]) {
  if (['image', 'nodeRef', 'nodeRefs'].includes(field.type)) return null;
  const value: FieldValue | undefined =
    field.type === 'computed' ? fieldValue(field, node.values, fields, { project: p, node }) : node.values[field.id];
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? literal(value.map(String)) : null;
  if (field.type === 'date') return dateValue(p, value);
  if (field.type === 'gender') return literal(GENDERS.find(([id]) => id === value)?.[1] ?? String(value));
  if (typeof value === 'number' || typeof value === 'boolean') return literal(value);
  return literal(String(value));
}

/**
 * El grafo entero del proyecto en Cypher: cada nodo con las etiquetas de su tipo y sus ancestros (y
 * `:Nodaria`), sus propiedades legibles y su `nodaria_id`; cada relación con su tipo y sus propiedades;
 * cada referencia como relación con el nombre del atributo; y la jerarquía como `DENTRO_DE`.
 */
export function projectCypher(p: Project, generatedAt = new Date()): string {
  const out = [
    `// Grafo de «${p.name}», exportado por Nodaria el ${generatedAt.toISOString().slice(0, 10)}.`,
    '// Ejecútalo en Neo4j Browser o con cypher-shell. Se puede repetir: no duplica nada (MERGE por nodaria_id).',
    '',
    'CREATE CONSTRAINT nodaria_id IF NOT EXISTS FOR (n:Nodaria) REQUIRE n.nodaria_id IS UNIQUE;',
    '',
  ];
  const id = (nodeId: string) => literal(nodeId);
  for (const node of p.nodes) {
    const labels = inheritedSchemas(p, node.typeId).map(s => name(s.name || 'Tipo'));
    const fields = allFields(p, node.typeId);
    const props = [`n.titulo = ${literal(nodeLabel(p, node))}`];
    for (const field of fields) {
      if (field.isTitle) continue;
      const value = propertyValue(p, node, field, fields);
      if (value !== null) props.push(`n.${name(field.key || field.label)} = ${value}`);
    }
    if (node.notes.trim()) props.push(`n.notas = ${literal(node.notes.trim())}`);
    out.push(
      `MERGE (n:Nodaria {nodaria_id: ${id(node.id)}}) SET n:${labels.join(':') || '`Nodo`'}, ${props.join(', ')};`,
    );
  }
  out.push('');
  const match = (a: string, b: string) =>
    `MATCH (a:Nodaria {nodaria_id: ${id(a)}}), (b:Nodaria {nodaria_id: ${id(b)}})`;
  for (const r of p.relations) {
    const schema = getSchema(p, r.typeId);
    const fields = allFields(p, r.typeId);
    const props: string[] = [];
    const role = relationRole(p, r, 'source');
    if (role && role !== schema?.name) props.push(`r.papel = ${literal(role)}`);
    for (const field of fields) {
      const value = r.values[field.id];
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        ['image', 'nodeRef', 'nodeRefs'].includes(field.type)
      )
        continue;
      props.push(
        `r.${name(field.key || field.label)} = ${
          field.type === 'date' ? dateValue(p, value) : literal(Array.isArray(value) ? value.map(String) : value)
        }`,
      );
    }
    out.push(
      `${match(r.sourceId, r.targetId)} MERGE (a)-[r:${relationType(schema?.name ?? 'RELACION')} {nodaria_id: ${literal(r.id)}}]->(b)${props.length ? ` SET ${props.join(', ')}` : ''};`,
    );
  }
  const exists = new Set(p.nodes.map(n => n.id));
  for (const node of p.nodes) {
    for (const field of allFields(p, node.typeId)) {
      if (field.type !== 'nodeRef' && field.type !== 'nodeRefs') continue;
      const raw = node.values[field.id];
      const ids = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
      for (const target of ids.filter(t => exists.has(t)))
        out.push(`${match(node.id, target)} MERGE (a)-[:${relationType(field.key || field.label)}]->(b);`);
    }
    if (node.parentId && exists.has(node.parentId))
      out.push(`${match(node.id, node.parentId)} MERGE (a)-[:DENTRO_DE]->(b);`);
  }
  out.push('');
  return out.join('\n');
}
