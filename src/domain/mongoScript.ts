import { columnDescription, engineOf, isEmbeddedType, tableColumns, type TableColumn } from './database';
import { nodeLabel } from './selectors';
import type { Project } from './types';

/*
 * Script de MongoDB (docs/roadmaps/ROADMAP_NOSQL.md): para cada nodo de una colección de MongoDB, la
 * colección con su validación `$jsonSchema` y sus índices. Se ejecuta con mongosh sobre la base de destino
 * y se puede repetir: si la colección ya existe, solo cambia su validación (`collMod`).
 *
 * Los subdocumentos incrustados van dentro del esquema (un objeto, o una lista de objetos); una referencia a
 * otra colección es un `objectId` (o una lista). Los índices de los campos de un subdocumento usan su ruta
 * («direccion.cp»); los de una lista de subdocumentos también (índice multiclave).
 */

const MAX_DEPTH = 6;

type JsonSchema = Record<string, unknown>;

/** El esquema de un campo; `path` es su ruta para los índices. */
function fieldSchema(p: Project, c: TableColumn, depth: number, open: Set<string>): JsonSchema {
  const description = columnDescription(c);
  const base: JsonSchema = description ? { description } : {};
  const many = c.field.type === 'nodeRefs';
  if (c.refKind === 'embedded' && c.target && depth < MAX_DEPTH && !open.has(c.target.id)) {
    const object = objectSchema(p, c.target.id, depth + 1, new Set([...open, c.target.id]));
    return many ? { ...base, bsonType: 'array', items: object } : { ...base, ...object };
  }
  const type = c.docType ?? 'string';
  if (type === 'array') {
    const item = c.reference && !c.crossEngine ? (c.refKind === 'embedded' ? 'object' : 'objectId') : 'string';
    return { ...base, bsonType: 'array', items: { bsonType: item } };
  }
  const schema: JsonSchema = { ...base, bsonType: type };
  if (c.field.type === 'select' && c.field.options.length && type === 'string') schema.enum = [...c.field.options];
  if (c.field.type === 'scale' && ['int', 'double', 'number'].includes(type))
    Object.assign(schema, { minimum: 1, maximum: 5 });
  return schema;
}

function objectSchema(p: Project, typeId: string, depth: number, open: Set<string>, withId = false): JsonSchema {
  const columns = tableColumns(p, typeId);
  const properties: Record<string, JsonSchema> = withId ? { _id: { bsonType: 'objectId' } } : {};
  const required: string[] = withId ? ['_id'] : [];
  for (const c of columns) {
    const name = c.field.key || c.field.label;
    properties[name] = fieldSchema(p, c, depth, open);
    if (!c.sql.nullable) required.push(name);
  }
  return { bsonType: 'object', ...(required.length ? { required } : {}), properties };
}

/** Índices: ruta del campo y si es único, también dentro de los subdocumentos incrustados. */
function indexesOf(p: Project, typeId: string, prefix: string, depth: number, open: Set<string>) {
  const result: { path: string; unique: boolean }[] = [];
  for (const c of tableColumns(p, typeId)) {
    const path = `${prefix}${c.field.key || c.field.label}`;
    if (c.refKind === 'embedded' && c.target) {
      if (depth < MAX_DEPTH && !open.has(c.target.id))
        result.push(...indexesOf(p, c.target.id, `${path}.`, depth + 1, new Set([...open, c.target.id])));
      continue;
    }
    if (c.sql.unique || c.sql.indexed) result.push({ path, unique: c.sql.unique });
  }
  return result;
}

/** Las colecciones de MongoDB del proyecto: cada nodo de un tipo de MongoDB que no es subdocumento. */
export const mongoCollections = (p: Project) =>
  p.nodes.filter(n => engineOf(p, n.typeId) === 'mongodb' && !isEmbeddedType(p, n.typeId));

export function mongoScript(p: Project, generatedAt = new Date()): string {
  const out = [
    `// Colecciones de «${p.name}» para MongoDB, generadas por Nodaria el ${generatedAt.toISOString().slice(0, 10)}.`,
    '// Ejecútalo con mongosh sobre la base de destino: mongosh "mongodb://servidor/base" este-archivo.js',
    '// Se puede repetir: si una colección ya existe, solo se actualiza su validación.',
    '',
    'function crearColeccion(nombre, esquema) {',
    '  if (db.getCollectionNames().includes(nombre)) {',
    '    db.runCommand({ collMod: nombre, validator: { $jsonSchema: esquema } });',
    '  } else {',
    '    db.createCollection(nombre, { validator: { $jsonSchema: esquema } });',
    '  }',
    '}',
    '',
  ];
  const taken = new Set<string>();
  for (const node of mongoCollections(p)) {
    let name = nodeLabel(p, node).trim() || 'sin_nombre';
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${nodeLabel(p, node).trim()}_${i}`;
    taken.add(name.toLowerCase());
    const schema = objectSchema(p, node.typeId, 0, new Set([node.typeId]), true);
    out.push(`// ${name}`, `crearColeccion(${JSON.stringify(name)}, ${JSON.stringify(schema, null, 2)});`);
    for (const index of indexesOf(p, node.typeId, '', 0, new Set([node.typeId])))
      out.push(
        `db.getCollection(${JSON.stringify(name)}).createIndex({ ${JSON.stringify(index.path)}: 1 }${
          index.unique ? ', { unique: true }' : ''
        });`,
      );
    out.push('');
  }
  if (taken.size === 0) out.push('// El proyecto no tiene colecciones de MongoDB.');
  return out.join('\n');
}
