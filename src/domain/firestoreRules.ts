import { engineOf, isEmbeddedType, tableColumns, type TableColumn } from './database';
import { nodeLabel } from './selectors';
import { stripAccents } from './text';
import type { Node, Project } from './types';

/*
 * Reglas de seguridad de Firestore (docs/roadmaps/ROADMAP_NOSQL.md): un esqueleto para `firestore.rules`
 * con una función que valida cada documento (solo los campos conocidos, los obligatorios presentes y cada
 * uno de su tipo) y, por colección, quién lee y escribe: por defecto, cualquier persona con sesión. Una
 * colección cuyo nodo cuelga de otra colección de Firestore es su subcolección. Los subdocumentos
 * incrustados se validan con su propia función; las listas de subdocumentos, solo como lista (las reglas
 * no recorren listas). Es un punto de partida: los permisos de verdad dependen de la aplicación.
 */

const RULE_TYPES: Record<string, string> = {
  string: 'string',
  number: 'number',
  int: 'int',
  boolean: 'bool',
  timestamp: 'timestamp',
  reference: 'path',
  array: 'list',
  map: 'map',
  geopoint: 'latlng',
  bytes: 'bytes',
};

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const ident = (text: string) =>
  stripAccents(text)
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^[^A-Za-z]+/, '') || 'Documento';

/** Las colecciones de Firestore: cada nodo de un tipo de Firestore que no es subdocumento. */
export const firestoreCollections = (p: Project) =>
  p.nodes.filter(n => engineOf(p, n.typeId) === 'firestore' && !isEmbeddedType(p, n.typeId));

export function firestoreRules(p: Project, generatedAt = new Date()): string {
  const collections = firestoreCollections(p);
  const ids = new Set(collections.map(n => n.id));
  const functions = new Map<string, string>(); // tipo → nombre de su función
  const bodies: string[] = [];
  const takenNames = new Set<string>();
  const functionName = (typeId: string, label: string) => {
    let name = functions.get(typeId);
    if (name) return name;
    const base = `es${ident(label)}Valido`;
    name = base;
    for (let i = 2; takenNames.has(name); i++) name = `${base}${i}`;
    takenNames.add(name);
    functions.set(typeId, name);
    bodies.push(validator(typeId, name));
    return name;
  };

  const check = (c: TableColumn, value: string) => {
    if (c.refKind === 'embedded' && c.target && c.field.type === 'nodeRef')
      return `${value} is map && ${functionName(c.target.id, c.target.name)}(${value})`;
    const type = RULE_TYPES[c.docType ?? 'string'] ?? 'string';
    const typed = `${value} is ${type}`;
    if (c.field.type === 'select' && c.field.options.length && type === 'string')
      return `${typed} && ${value} in [${c.field.options.map(quote).join(', ')}]`;
    return typed;
  };

  function validator(typeId: string, name: string): string {
    const columns = tableColumns(p, typeId);
    const names = columns.map(c => c.field.key || c.field.label);
    const conditions = [`data.keys().hasOnly([${names.map(quote).join(', ')}])`];
    const required = columns.filter(c => !c.sql.nullable).map(c => c.field.key || c.field.label);
    if (required.length) conditions.push(`data.keys().hasAll([${required.map(quote).join(', ')}])`);
    columns.forEach(c => {
      const key = c.field.key || c.field.label;
      const value = `data[${quote(key)}]`;
      conditions.push(c.sql.nullable ? `(!(${quote(key)} in data) || ${check(c, value)})` : check(c, value));
    });
    return [`    function ${name}(data) {`, `      return ${conditions.join('\n        && ')};`, '    }'].join('\n');
  }

  const matchOf = (node: Node, depth: number): string[] => {
    const indent = '    '.repeat(depth + 1);
    const name = nodeLabel(p, node).trim() || 'sin_nombre';
    const variable = `${ident(name).replace(/^./, c => c.toLowerCase())}Id`;
    const valid = functionName(node.typeId, nodeLabel(p, node));
    const children = collections.filter(c => c.parentId === node.id);
    return [
      `${indent}match /${name}/{${variable}} {`,
      `${indent}  allow read: if request.auth != null;`,
      `${indent}  allow create, update: if request.auth != null && ${valid}(request.resource.data);`,
      `${indent}  allow delete: if request.auth != null;`,
      ...children.flatMap(child => matchOf(child, depth + 1)),
      `${indent}}`,
    ];
  };

  const roots = collections.filter(n => !n.parentId || !ids.has(n.parentId));
  const matches = roots.flatMap(n => matchOf(n, 1));
  return [
    "rules_version = '2';",
    `// Reglas de «${p.name}» para Firestore, generadas por Nodaria el ${generatedAt.toISOString().slice(0, 10)}.`,
    '// Punto de partida: valida la forma de cada documento y deja leer y escribir a quien tiene sesión.',
    '// Ajusta los permisos a tu aplicación antes de publicarlas.',
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    ...bodies,
    ...(bodies.length ? [''] : []),
    ...matches,
    ...(matches.length ? [] : ['    // El proyecto no tiene colecciones de Firestore.']),
    '  }',
    '}',
    '',
  ].join('\n');
}
