import type { DbEngine, FieldDefinition } from './types';

/*
 * Motores de base de datos (docs/roadmaps/ROADMAP_NOSQL.md). Cada tipo de base de datos elige el suyo
 * (`Schema.dbEngine`, heredable); un proyecto puede mezclarlos y sus tipos se referencian entre sí.
 *
 * - SQL Server: tablas y columnas con su tipo SQL (`database.ts`, `sqlScript.ts`).
 * - MongoDB y Firestore: colecciones de documentos. Un tipo «subdocumento» (`Schema.embedded`) no tiene
 *   colección propia: una referencia hacia él lo incrusta (una referencia simple, un objeto; una múltiple,
 *   una lista de objetos). Una referencia a otra colección guarda su id.
 * - Neo4j: etiquetas de nodo con sus propiedades; las referencias son relaciones.
 *
 * Aquí, lo que no depende del proyecto: los motores y los tipos de campo de cada uno, y cuál se deduce de
 * un atributo cuando no se elige ninguno (como el tipo SQL «Automático»).
 */

export const DB_ENGINES: ReadonlyArray<{ id: DbEngine; label: string; container: string; containers: string }> = [
  { id: 'sqlserver', label: 'SQL Server', container: 'tabla', containers: 'tablas' },
  { id: 'mongodb', label: 'MongoDB', container: 'colección', containers: 'colecciones' },
  { id: 'firestore', label: 'Firestore', container: 'colección', containers: 'colecciones' },
  { id: 'neo4j', label: 'Neo4j', container: 'etiqueta', containers: 'etiquetas' },
];

export const engineLabel = (engine: DbEngine) => DB_ENGINES.find(e => e.id === engine)?.label ?? engine;
/** Bases de documentos: colecciones, subdocumentos incrustados y referencias por id. */
export const isDocumentEngine = (engine: DbEngine | null): engine is 'mongodb' | 'firestore' =>
  engine === 'mongodb' || engine === 'firestore';

/** Cómo se guarda una referencia: incrustada (el subdocumento dentro) o por id de otro documento o nodo. */
export type ReferenceKind = 'embedded' | 'reference';

/** Tipos de campo de cada motor que no es SQL, con su nombre en ese motor. */
export const DOC_TYPES: Record<Exclude<DbEngine, 'sqlserver'>, ReadonlyArray<string>> = {
  // «number» es el alias de MongoDB para cualquier número (int, long, double o decimal).
  mongodb: [
    'string',
    'number',
    'int',
    'long',
    'double',
    'decimal',
    'bool',
    'date',
    'objectId',
    'array',
    'object',
    'binData',
  ],
  firestore: ['string', 'number', 'int', 'boolean', 'timestamp', 'reference', 'array', 'map', 'geopoint', 'bytes'],
  neo4j: ['String', 'Integer', 'Float', 'Boolean', 'Date', 'DateTime', 'List<String>', 'Point'],
};

/** Si el tipo guardado vale en ese motor (al cambiar de motor, uno que no vale vuelve a deducirse). */
export const isDocType = (engine: DbEngine, type: unknown): type is string =>
  engine !== 'sqlserver' && typeof type === 'string' && DOC_TYPES[engine].includes(type);

/** El tipo que se deduce de un atributo en un motor que no es SQL. */
export function deduceDocType(
  engine: Exclude<DbEngine, 'sqlserver'>,
  field: FieldDefinition,
  ref: ReferenceKind | null,
) {
  const many = field.type === 'nodeRefs';
  if (field.type === 'nodeRef' || field.type === 'nodeRefs') {
    if (engine === 'neo4j') return 'relación';
    if (ref === 'embedded') return engine === 'mongodb' ? (many ? 'array' : 'object') : many ? 'array' : 'map';
    if (engine === 'mongodb') return many ? 'array' : 'objectId';
    return many ? 'array' : 'reference';
  }
  const table: Record<Exclude<DbEngine, 'sqlserver'>, Partial<Record<FieldDefinition['type'], string>>> = {
    mongodb: {
      number: 'number',
      scale: 'int',
      boolean: 'bool',
      date: 'date',
      tags: 'array',
      list: 'array',
    },
    firestore: {
      number: 'number',
      scale: 'int',
      boolean: 'boolean',
      date: 'timestamp',
      tags: 'array',
      list: 'array',
    },
    neo4j: {
      number: 'Float',
      scale: 'Integer',
      boolean: 'Boolean',
      date: 'Date',
      tags: 'List<String>',
      list: 'List<String>',
    },
  };
  return table[engine][field.type] ?? (engine === 'neo4j' ? 'String' : 'string');
}

/** Texto del tipo de una referencia en la tarjeta: «objectId → Cliente», «[Dirección]», «[reference] → Pedido». */
export function referenceTypeText(
  engine: Exclude<DbEngine, 'sqlserver'>,
  ref: ReferenceKind | null,
  targetName: string | undefined,
  many: boolean,
) {
  if (engine === 'neo4j') return targetName ? `relación → ${targetName}` : 'relación';
  if (ref === 'embedded' && targetName) return many ? `[${targetName}]` : targetName;
  const id = engine === 'mongodb' ? 'objectId' : 'reference';
  const type = many ? `[${id}]` : id;
  return targetName ? `${type} → ${targetName}` : type;
}
