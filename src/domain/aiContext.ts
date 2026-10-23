import { databaseLint } from './databaseLint';
import {
  columnSqlIn,
  convertType,
  engineOf,
  isDatabaseType,
  isEmbeddedType,
  isTableType,
  sqlColumnOf,
  sqlTypeText,
  tableColumns,
  type TableColumn,
} from './database';
import { isDocumentEngine } from './dbEngines';
import type { DbEngine } from './types';

// El asistente propone tipos de SQL Server; las tablas de Db2 for i se le enseñan con su equivalente y lo
// que proponga se convierte al aplicarlo (`convertType`).
const asSqlServer = (type: Parameters<typeof convertType>[0]) => sqlTypeText(convertType(type, 'sqlserver'));
import { isFieldLink } from './library';
import { getSchema, nodeLabel } from './selectors';
import type { Node, Project, Schema } from './types';

/*
 * Contexto que la asistencia de IA envía al proveedor sobre un proyecto con tablas. Es lo mínimo
 * para proponer cambios del esquema: tablas, columnas con su tipo SQL y sus claves, a qué tabla
 * apunta cada clave foránea, y lo que se puede reutilizar (los tipos base de los que heredan las
 * tablas y las preformas de la biblioteca). Nunca lleva notas, imágenes ni valores de fichas que no
 * sean FK.
 *
 * Tablas y bases van con un identificador corto (`t1`…, `b1`…) que el modelo usa en sus
 * operaciones; `refs` lo traduce de vuelta al nodo o al tipo. Se guarda con la petición: si el
 * proyecto cambia mientras tanto, la propuesta se sigue resolviendo contra lo mismo.
 */

export interface AiColumnContext {
  name: string;
  /** Tipo SQL Server en texto: «int», «nvarchar(50)», «decimal(10,2)». */
  type: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  identity: boolean;
  /** Tabla a la que apunta, si es una clave foránea (o, en una colección, una referencia por id). */
  references: string | null;
  /** En una colección o un subdocumento: el subdocumento que lleva dentro (`s1`…) y si es una lista. */
  embeds?: string | null;
  many?: boolean;
  /** Dónde se define: propia del tipo, la preforma que vincula o el tipo del que la hereda. */
  origin: string;
  description: string;
}

export interface AiTableContext {
  id: string;
  name: string;
  /** Tipo de Nodaria que define sus columnas. */
  typeName: string;
  /** Base de la que hereda (`b1`…), si la hay. */
  base: string | null;
  description: string;
  /** Otras tablas con el mismo tipo: cambiar sus columnas las cambia a la vez. */
  sharesColumnsWith: string[];
  /** Fuera de la parte elegida solo se envían las claves primarias. */
  partial: boolean;
  /** Su base: una tabla relacional o una colección de documentos. */
  engine?: AiEngine;
  columns: AiColumnContext[];
}

export type AiEngine = 'sqlserver' | 'db2i' | 'mongodb' | 'firestore';

/** Un subdocumento: va dentro de las colecciones por un campo, sin colección propia (`Schema.embedded`). */
export interface AiSubdocumentContext {
  id: string;
  name: string;
  engine: 'mongodb' | 'firestore';
  description: string;
  columns: AiColumnContext[];
}

/** Tipo del que heredan tablas: una tabla nueva puede heredar de él y recibir sus columnas. */
export interface AiBaseContext {
  id: string;
  name: string;
  /** Base de la que hereda a su vez. */
  base: string | null;
  /** Columnas que da a quien herede de ella. */
  columns: AiColumnContext[];
  /** Cuántas tablas heredan de ella. */
  tables: number;
}

/** Atributo de la biblioteca que una tabla puede vincular en lugar de crear una columna nueva. */
export interface AiPreformContext {
  name: string;
  type: string;
  /** Es una referencia a otra tabla (sirve para una clave foránea). */
  reference: boolean;
  primaryKey: boolean;
  nullable: boolean;
  description: string;
}

export interface AiDatabaseContext {
  projectName: string;
  tables: AiTableContext[];
  bases: AiBaseContext[];
  preforms: AiPreformContext[];
  /** Los subdocumentos de las colecciones (MongoDB y Firestore). */
  subdocuments?: AiSubdocumentContext[];
  /** Avisos del linter del esquema (`databaseLint`), como texto. */
  issues: string[];
}

export interface AiContextRefs {
  /** Identificador corto de cada tabla → id del nodo. */
  tables: Record<string, string>;
  /** Identificador corto de cada base → id del tipo. */
  bases?: Record<string, string>;
  /** Identificador corto de cada subdocumento → id del tipo. */
  subdocuments?: Record<string, string>;
}

/** Las bases que entiende el asistente (Neo4j no: es un grafo, no tablas ni documentos). */
export const aiEngineOf = (p: Project, typeId: string): AiEngine | null => {
  const engine: DbEngine | null = engineOf(p, typeId);
  return engine === 'sqlserver' || engine === 'db2i' || engine === 'mongodb' || engine === 'firestore' ? engine : null;
};
/** Una tabla o una colección (no un subdocumento) que el asistente puede tocar. */
export const isAiTable = (p: Project, typeId: string) =>
  isDatabaseType(p, typeId) && !isEmbeddedType(p, typeId) && aiEngineOf(p, typeId) !== null;

export const AI_CONTEXT_MAX_ISSUES = 50;

function originText(c: TableColumn) {
  if (c.origin.kind === 'library') return `preforma ${c.field.key}`;
  if (c.origin.kind === 'inherited') {
    const viaLibrary = c.origin.from.fields.some(f => isFieldLink(f) && f.ref === c.field.id);
    return `heredada de ${c.origin.from.name}${viaLibrary ? ` (preforma ${c.field.key})` : ''}`;
  }
  return 'propia';
}

function columnContext(
  p: Project,
  node: Node | null,
  c: TableColumn,
  idOf: Map<string, string>,
  subOf: Map<string, string> = new Map(),
  engine: AiEngine = 'sqlserver',
): AiColumnContext {
  const target = node && c.field.type === 'nodeRef' ? node.values[c.field.id] : undefined;
  const documents = isDocumentEngine(engine);
  const embeds = documents && c.refKind === 'embedded' && c.target ? (subOf.get(c.target.id) ?? null) : null;
  return {
    name: c.field.key || c.field.label,
    // En una colección, el tipo del campo en su base; en una tabla, el de SQL Server.
    type: documents ? (c.docType ?? 'string') : asSqlServer(c.type),
    ...(documents ? { embeds, many: c.field.type === 'nodeRefs' } : {}),
    primaryKey: c.sql.primaryKey,
    nullable: c.sql.nullable,
    unique: c.sql.unique,
    identity: c.sql.identity,
    references: typeof target === 'string' ? (idOf.get(target) ?? null) : null,
    origin: originText(c),
    description: c.field.description,
  };
}

/** Tipos tabla de los que hereda algún otro tipo (las bases que se pueden reutilizar). */
function baseTypes(p: Project): Schema[] {
  return p.schemas.filter(
    s => s.kind === 'entity' && isTableType(p, s.id) && p.schemas.some(c => c.parentTypeId === s.id),
  );
}

/**
 * Contexto del esquema de un proyecto. Con `focusNodeIds`, solo esas tablas van completas; las
 * demás llevan su clave primaria, para que el modelo pueda apuntarles una FK.
 */
export function databaseContext(
  p: Project,
  focusNodeIds?: readonly string[],
): { context: AiDatabaseContext; refs: AiContextRefs } {
  const tableNodes = p.nodes.filter(n => isAiTable(p, n.typeId));
  const subdocuments = p.schemas.filter(s => isDatabaseType(p, s.id) && isEmbeddedType(p, s.id) && aiEngineOf(p, s.id));
  const subOf = new Map(subdocuments.map((s, i) => [s.id, `s${i + 1}`]));
  const idOf = new Map(tableNodes.map((n, i) => [n.id, `t${i + 1}`]));
  const bases = baseTypes(p);
  const baseId = new Map(bases.map((s, i) => [s.id, `b${i + 1}`]));
  const focus = focusNodeIds?.length ? new Set(focusNodeIds) : null;
  const byType = new Map<string, Node[]>();
  tableNodes.forEach(n => byType.set(n.typeId, [...(byType.get(n.typeId) ?? []), n]));
  const baseOf = (s: Schema | undefined) => (s?.parentTypeId ? (baseId.get(s.parentTypeId) ?? null) : null);

  const tables = tableNodes.map((node): AiTableContext => {
    const schema = getSchema(p, node.typeId);
    const partial = focus !== null && !focus.has(node.id);
    return {
      id: idOf.get(node.id)!,
      name: nodeLabel(p, node),
      typeName: schema?.name ?? '',
      base: baseOf(schema),
      description: schema?.description ?? '',
      sharesColumnsWith: (byType.get(node.typeId) ?? []).filter(n => n.id !== node.id).map(n => idOf.get(n.id)!),
      partial,
      engine: aiEngineOf(p, node.typeId) ?? 'sqlserver',
      columns: tableColumns(p, node.typeId)
        .filter(c => !partial || c.sql.primaryKey)
        .map(c => columnContext(p, node, c, idOf, subOf, aiEngineOf(p, node.typeId) ?? 'sqlserver')),
    };
  });

  const usedLibrary = new Set(p.schemas.flatMap(s => s.fields.flatMap(f => (isFieldLink(f) ? [f.ref] : []))));
  // Primero las que ya usa alguna tabla: son las que siguen el estilo del proyecto.
  const preforms = [...p.fieldLibrary]
    .filter(f => !f.isTitle && f.type !== 'computed')
    .sort((a, b) => Number(usedLibrary.has(b.id)) - Number(usedLibrary.has(a.id)))
    .map((f): AiPreformContext => {
      // Sus metadatos tal como los ve una tabla que la use (o los suyos, si ninguna la usa todavía).
      const user = p.schemas.find(s => isTableType(p, s.id) && s.fields.some(x => isFieldLink(x) && x.ref === f.id));
      const sql = user ? columnSqlIn(p, user.id, f) : sqlColumnOf(f);
      const column = user ? tableColumns(p, user.id).find(c => c.field.id === f.id) : undefined;
      return {
        name: f.key || f.label,
        type: column ? asSqlServer(column.type) : sql.type ? asSqlServer(sql.type) : '',
        reference: f.type === 'nodeRef',
        primaryKey: sql.primaryKey,
        nullable: sql.nullable,
        description: f.description,
      };
    });

  return {
    context: {
      projectName: p.name,
      tables,
      bases: bases.map(s => ({
        id: baseId.get(s.id)!,
        name: s.name,
        base: baseOf(s),
        columns: tableColumns(p, s.id).map(c => columnContext(p, null, c, idOf)),
        tables: tableNodes.filter(n => {
          let cur = getSchema(p, n.typeId);
          const seen = new Set<string>();
          while (cur && !seen.has(cur.id)) {
            if (cur.parentTypeId === s.id) return true;
            seen.add(cur.id);
            cur = cur.parentTypeId ? getSchema(p, cur.parentTypeId) : undefined;
          }
          return false;
        }).length,
      })),
      preforms,
      subdocuments: subdocuments.map(s => ({
        id: subOf.get(s.id)!,
        name: s.name,
        engine: aiEngineOf(p, s.id) as 'mongodb' | 'firestore',
        description: s.description,
        columns: tableColumns(p, s.id).map(c => columnContext(p, null, c, idOf, subOf, aiEngineOf(p, s.id)!)),
      })),
      issues: databaseLint(p)
        .slice(0, AI_CONTEXT_MAX_ISSUES)
        .map(issue => issue.message),
    },
    refs: {
      tables: Object.fromEntries([...idOf].map(([nodeId, id]) => [id, nodeId])),
      bases: Object.fromEntries([...baseId].map(([typeId, id]) => [id, typeId])),
      subdocuments: Object.fromEntries([...subOf].map(([typeId, id]) => [id, typeId])),
    },
  };
}
