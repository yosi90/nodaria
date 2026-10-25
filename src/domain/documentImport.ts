import { engineOf, isDatabaseType, type SqlColumn } from './database';
import { createField, createSchema, now, uid } from './factories';
import { allFields, getSchema, nodeLabel } from './selectors';
import { foldText } from './text';
import type { FieldDefinition, FieldType, Node, Project, Schema } from './types';

/*
 * Importar el esquema de una base de documentos que ya existe (docs/roadmaps/ROADMAP_NOSQL.md, «Opcional»):
 * se pega o se sube una muestra de documentos de cada colección (lo que da `mongoexport`, un array JSON, un
 * documento por línea o lo que escribe mongosh, con `ObjectId(…)` e `ISODate(…)`) y se deduce su forma:
 *
 * - cada campo con su tipo (el JSON extendido de MongoDB dice cuáles son fechas, ids, enteros o decimales);
 * - obligatorio si está (y no es nulo) en todos los documentos de la muestra;
 * - una lista de opciones si es un texto con pocos valores que se repiten;
 * - los objetos y las listas de objetos, como subdocumentos (`Schema.embedded`), también anidados;
 * - un id de otro documento como referencia a su colección, si su nombre la nombra (`cliente_id`,
 *   `clienteId` o `cliente` → «clientes»); un id que no se reconoce queda como texto con su tipo.
 *
 * El `_id` no se importa: Nodaria ya da a cada documento de MongoDB el suyo.
 */

export type ValueKind = 'string' | 'int' | 'double' | 'decimal' | 'bool' | 'date' | 'objectId' | 'object' | 'array';

export interface InferredField {
  key: string;
  kind: ValueKind;
  required: boolean;
  /** En una lista: de qué son sus elementos. */
  items?: ValueKind;
  /** En un objeto o una lista de objetos: su forma. */
  shape?: InferredShape;
  /** Textos con pocos valores que se repiten: sus opciones. */
  options?: string[];
  /** Mezcla tipos distintos: se queda con el más frecuente y se avisa. */
  mixed?: boolean;
  /** El texto es largo (más de 200 caracteres de media). */
  long?: boolean;
}
export interface InferredShape {
  fields: InferredField[];
  documents: number;
}
export interface SampleCollection {
  name: string;
  shape: InferredShape;
  warnings: string[];
}

// --- Leer los documentos ---

/** Lo que escribe mongosh a JSON extendido: claves sin comillas, comillas simples y ObjectId(…), ISODate(…). */
function fromShell(text: string) {
  return text
    .replace(/ObjectId\(\s*["']([0-9a-fA-F]{24})["']\s*\)/g, '{"$oid":"$1"}')
    .replace(/(?:ISODate|new Date)\(\s*["']([^"']+)["']\s*\)/g, '{"$date":"$1"}')
    .replace(/NumberLong\(\s*["']?(-?\d+)["']?\s*\)/g, '{"$numberLong":"$1"}')
    .replace(/NumberInt\(\s*["']?(-?\d+)["']?\s*\)/g, '{"$numberInt":"$1"}')
    .replace(/NumberDecimal\(\s*["']([^"']+)["']\s*\)/g, '{"$numberDecimal":"$1"}')
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, s: string) => JSON.stringify(s.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Los documentos de un texto. Un objeto cuyas claves son listas de documentos se lee como varias colecciones
 * (`{ "clientes": [...], "pedidos": [...] }`); entonces devuelve un mapa.
 */
export function parseDocuments(text: string): { documents: unknown[] } | { collections: Record<string, unknown[]> } {
  const clean = text.trim();
  if (!clean) return { documents: [] };
  const attempts = [clean, fromShell(clean)];
  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt);
      if (Array.isArray(value)) return { documents: value.filter(isObject) };
      if (isObject(value)) {
        const lists = Object.entries(value).filter(([, v]) => Array.isArray(v) && v.every(isObject));
        if (lists.length && lists.length === Object.keys(value).length)
          return { collections: Object.fromEntries(lists) as Record<string, unknown[]> };
        return { documents: [value] };
      }
    } catch {
      // Uno por línea (mongoexport, NDJSON) o varios seguidos.
      const lines = attempt.split(/\r?\n/).filter(l => l.trim());
      const documents: unknown[] = [];
      let ok = lines.length > 0;
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (isObject(value)) documents.push(value);
        } catch {
          ok = false;
          break;
        }
      }
      if (ok) return { documents };
    }
  }
  throw new Error('No se entiende como JSON: pega un array de documentos o un documento por línea.');
}

// --- Deducir la forma ---

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function kindOf(value: unknown): ValueKind | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'string') return ISO_DATE.test(value) ? 'date' : 'string';
  if (Array.isArray(value)) return 'array';
  if (isObject(value)) {
    if ('$oid' in value) return 'objectId';
    if ('$date' in value) return 'date';
    if ('$numberLong' in value || '$numberInt' in value) return 'int';
    if ('$numberDouble' in value) return 'double';
    if ('$numberDecimal' in value) return 'decimal';
    // Firestore: una marca de tiempo exportada ({ _seconds, _nanoseconds }) o una referencia ({ __ref__ }).
    if ('_seconds' in value && '_nanoseconds' in value) return 'date';
    return 'object';
  }
  return 'string';
}

/** El tipo más frecuente de unos valores; entre int y double, double; entre double y decimal, decimal. */
function dominant(kinds: ValueKind[]) {
  const counts = new Map<ValueKind, number>();
  kinds.forEach(k => counts.set(k, (counts.get(k) ?? 0) + 1));
  if (counts.has('int') && (counts.has('double') || counts.has('decimal'))) {
    const n = (counts.get('int') ?? 0) + (counts.get('double') ?? 0);
    counts.delete('int');
    counts.set(counts.has('decimal') ? 'decimal' : 'double', n + (counts.get('decimal') ?? 0));
    if (counts.has('decimal')) counts.delete('double');
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return { kind: sorted[0]?.[0] ?? 'string', mixed: sorted.length > 1 };
}

/** La forma de unos documentos (o de los objetos que van dentro de ellos). */
export function inferShape(documents: unknown[]): InferredShape {
  const docs = documents.filter(isObject);
  const keys: string[] = [];
  docs.forEach(d => Object.keys(d).forEach(k => keys.includes(k) || keys.push(k)));
  const fields = keys
    .filter(k => k !== '_id')
    .map(key => {
      const values = docs.map(d => d[key]);
      const present = values.filter(v => v !== null && v !== undefined);
      const kinds = present.map(kindOf).filter((k): k is ValueKind => k !== null);
      const { kind, mixed } = dominant(kinds);
      const field: InferredField = { key, kind, required: present.length === docs.length && docs.length > 0 };
      if (mixed) field.mixed = true;
      if (kind === 'object') field.shape = inferShape(present.filter(isObject));
      if (kind === 'array') {
        const items = present.filter(Array.isArray).flat();
        const itemKinds = items.map(kindOf).filter((k): k is ValueKind => k !== null);
        field.items = itemKinds.length ? dominant(itemKinds).kind : 'string';
        if (field.items === 'object') field.shape = inferShape(items.filter(isObject));
      }
      if (kind === 'string') {
        const texts = present.filter((v): v is string => typeof v === 'string');
        const distinct = [...new Set(texts)];
        // Pocos valores que se repiten (un estado, un tipo): una lista de opciones.
        if (
          texts.length >= 6 &&
          distinct.length <= 6 &&
          distinct.length * 2 <= texts.length &&
          distinct.every(t => t.length <= 40)
        )
          field.options = distinct;
        if (texts.length && texts.reduce((n, t) => n + t.length, 0) / texts.length > 200) field.long = true;
      }
      return field;
    });
  return { fields, documents: docs.length };
}

/** Lee una colección de una muestra de documentos, con lo que conviene avisar. */
export function sampleCollection(name: string, documents: unknown[]): SampleCollection {
  const shape = inferShape(documents);
  const warnings: string[] = [];
  if (documents.length < 3) warnings.push(`${name}: solo ${documents.length} documento(s); con más, se deduce mejor.`);
  const walk = (s: InferredShape, path: string) =>
    s.fields.forEach(f => {
      if (f.mixed) warnings.push(`${name}.${path}${f.key}: mezcla tipos; se usa ${f.kind}.`);
      if (f.shape) walk(f.shape, `${path}${f.key}.`);
    });
  walk(shape, '');
  const ids = documents.filter(isObject).map(d => kindOf(d._id));
  if (ids.some(k => k && k !== 'objectId')) warnings.push(`${name}: su _id no es un ObjectId; Nodaria le da el suyo.`);
  return { name, shape, warnings };
}

// --- Crear los tipos ---

const simplify = (text: string) => foldText(text).replace(/[^a-z0-9]/g, '');
/** Las formas de nombrar una colección por su singular y su plural («clientes» → cliente, clientes). */
function collectionNames(name: string) {
  const base = simplify(name);
  return new Set([base, base.replace(/es$/, ''), base.replace(/s$/, '')]);
}
/** A qué colección apunta un campo de ids por su nombre (`cliente_id`, `clienteId`, `cliente`, `clientes`). */
function referencedCollection(key: string, collections: string[]) {
  const stem = simplify(key.replace(/(_id|Id|_ids|Ids)$/, ''));
  return collections.find(c => {
    const names = collectionNames(c);
    return names.has(stem) || names.has(stem.replace(/s$/, '')) || names.has(stem.replace(/es$/, ''));
  });
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface DocumentImportOptions {
  engine: 'mongodb' | 'firestore';
  /** Tipo del que heredan las colecciones nuevas, o ninguno. */
  baseTypeId: string | null;
}

/** Las colecciones del proyecto de ese motor, por nombre en minúsculas: su nodo. */
function existingCollections(p: Project, engine: string) {
  const map = new Map<string, Node>();
  p.nodes.forEach(n => {
    if (isDatabaseType(p, n.typeId) && engineOf(p, n.typeId) === engine) map.set(nodeLabel(p, n).toLowerCase(), n);
  });
  return map;
}

/** Qué pasará con cada colección leída: nueva o ya en el proyecto. */
export function documentImportPreview(p: Project, collections: SampleCollection[], engine: string) {
  const existing = existingCollections(p, engine);
  return collections.map(c => ({ collection: c, exists: existing.has(c.name.toLowerCase()) }));
}

export function importDocumentCollections(p: Project, collections: SampleCollection[], options: DocumentImportOptions) {
  const { engine } = options;
  const base = options.baseTypeId ? getSchema(p, options.baseTypeId) : undefined;
  const inherited = base ? allFields(p, base.id) : [];
  const titleField = inherited.find(f => f.isTitle);
  const existing = existingCollections(p, engine);
  const fresh = collections.filter(c => !existing.has(c.name.toLowerCase()));
  const names = [...collections.map(c => c.name), ...[...existing.keys()]];
  const schemas: Schema[] = [];
  const nodes: Node[] = [];
  const warnings: string[] = [];
  const typeNames = new Set(p.schemas.map(s => s.name.toLowerCase()));
  const freeTypeName = (name: string) => {
    let candidate = name;
    for (let i = 2; typeNames.has(candidate.toLowerCase()); i++) candidate = `${name} ${i}`;
    typeNames.add(candidate.toLowerCase());
    return candidate;
  };

  // Primero los nodos de las colecciones nuevas, para que las referencias encuentren su destino.
  const created = fresh.map(c => {
    const schema: Schema = {
      // Sin título heredado, el nodo se llama como su tipo: el nombre de la colección, tal cual.
      ...createSchema(freeTypeName(titleField ? capitalize(c.name) : c.name), 'entity'),
      parentTypeId: base?.id ?? null,
      table: true,
      dbEngine: base && engineOf(p, base.id) === engine ? null : engine,
      icon: 'phosphor-database',
    };
    const node: Node = {
      id: uid('node'),
      typeId: schema.id,
      parentId: null,
      values: titleField ? { [titleField.id]: c.name } : {},
      createdAt: now(),
      positions: {},
      notes: '',
    };
    return { collection: c, schema, node };
  });
  const nodeOfCollection = (name: string) =>
    created.find(c => c.collection.name === name)?.node ?? existing.get(name.toLowerCase());
  const typeOfCollection = (name: string) => {
    const node = nodeOfCollection(name);
    return node ? node.typeId : undefined;
  };

  /** Los atributos de una forma; los objetos de dentro crean su tipo «subdocumento». */
  const fieldsOf = (shape: InferredShape, owner: string, node: Node | null): FieldDefinition[] => {
    // Las colecciones heredan del tipo base; los subdocumentos, no.
    const taken = new Set((node ? inherited : []).map(f => f.key.toLowerCase()));
    return shape.fields
      .filter(f => !taken.has(f.key.toLowerCase()))
      .map(f => {
        const field: FieldDefinition = { ...createField(), key: f.key, label: f.key, required: f.required };
        let type: FieldType = 'text';
        let docType: string | undefined;
        const isRef = f.kind === 'objectId' || (f.kind === 'array' && f.items === 'objectId');
        const target = isRef ? referencedCollection(f.key, names) : undefined;
        if (f.kind === 'object' || (f.kind === 'array' && f.items === 'object')) {
          const sub: Schema = {
            ...createSchema(freeTypeName(capitalize(f.key)), 'entity'),
            table: true,
            dbEngine: engine,
            embedded: true,
            icon: 'phosphor-database',
            description: `Dentro de ${owner}.`,
          };
          sub.fields = fieldsOf(f.shape ?? { fields: [], documents: 0 }, sub.name, null);
          schemas.push(sub);
          type = f.kind === 'array' ? 'nodeRefs' : 'nodeRef';
          field.referenceTypeIds = [sub.id];
        } else if (target && typeOfCollection(target)) {
          type = f.kind === 'array' ? 'nodeRefs' : 'nodeRef';
          field.referenceTypeIds = [typeOfCollection(target)!];
          // La referencia del nodo de la colección apunta al de la otra (como en el diagrama).
          if (node)
            node.values[field.id] = f.kind === 'array' ? [nodeOfCollection(target)!.id] : nodeOfCollection(target)!.id;
        } else if (f.kind === 'array') {
          type = f.items === 'string' ? 'tags' : 'list';
          if (f.items === 'objectId') docType = 'array';
        } else {
          const map: Partial<Record<ValueKind, FieldType>> = {
            int: 'number',
            double: 'number',
            decimal: 'number',
            bool: 'boolean',
            date: 'date',
          };
          type = f.options ? 'select' : f.long ? 'longText' : (map[f.kind] ?? 'text');
          if (f.options) field.options = f.options;
          if (engine === 'mongodb') {
            docType = { int: 'int', double: 'double', decimal: 'decimal', objectId: 'objectId' }[f.kind as string];
          } else if (f.kind === 'int') docType = 'int';
          if (f.kind === 'objectId')
            warnings.push(`${owner}.${f.key}: es un id, pero no se reconoce de qué colección.`);
        }
        field.type = type;
        const sql: SqlColumn = {
          type: null,
          primaryKey: false,
          nullable: !f.required,
          unique: false,
          identity: false,
          excluded: false,
          ...(docType ? { docType } : {}),
        };
        field.sql = sql;
        return field;
      });
  };

  created.forEach(c => {
    c.schema.fields = fieldsOf(c.collection.shape, c.collection.name, c.node);
    schemas.push(c.schema);
    nodes.push(c.node);
    warnings.push(...c.collection.warnings);
  });
  collections
    .filter(c => existing.has(c.name.toLowerCase()))
    .forEach(c => warnings.push(`${c.name}: ya está en el proyecto; no se toca.`));
  return {
    project: { ...p, schemas: [...p.schemas, ...schemas], nodes: [...p.nodes, ...nodes] },
    created: created.map(c => c.collection.name),
    subdocuments: schemas.filter(s => s.embedded).length,
    warnings,
  };
}
