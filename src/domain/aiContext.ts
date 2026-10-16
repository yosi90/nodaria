import { databaseLint } from './databaseLint';
import { isTableType, sqlTypeText, tableColumns, type TableColumn } from './database';
import { getSchema, nodeLabel } from './selectors';
import type { Node, Project } from './types';

/*
 * Contexto que la asistencia de IA envía al proveedor sobre un proyecto con tablas. Es lo mínimo
 * para proponer cambios del esquema: tablas, columnas con su tipo SQL y sus claves, y a qué tabla
 * apunta cada clave foránea. Nunca lleva notas, imágenes ni valores de fichas que no sean FK.
 *
 * Las tablas van con un identificador corto (`t1`, `t2`…) que el modelo usa en sus operaciones;
 * `refs` lo traduce de vuelta al nodo. Se guarda con la petición: si el proyecto cambia mientras
 * tanto, la propuesta se sigue resolviendo contra las mismas tablas.
 */

export interface AiColumnContext {
  name: string;
  /** Tipo SQL Server en texto: «int», «nvarchar(50)», «decimal(10,2)». */
  type: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  identity: boolean;
  /** Tabla a la que apunta, si es una clave foránea. */
  references: string | null;
  /** Dónde se define: propia del tipo, preforma compartida o heredada de otro tipo. */
  origin: string;
  description: string;
}

export interface AiTableContext {
  id: string;
  name: string;
  /** Tipo de Nodaria que define sus columnas. */
  typeName: string;
  description: string;
  /** Otras tablas con el mismo tipo: cambiar sus columnas las cambia a la vez. */
  sharesColumnsWith: string[];
  /** Fuera de la parte elegida solo se envían las claves primarias. */
  partial: boolean;
  columns: AiColumnContext[];
}

export interface AiDatabaseContext {
  projectName: string;
  tables: AiTableContext[];
  /** Avisos del linter del esquema (`databaseLint`), como texto. */
  issues: string[];
}

export interface AiContextRefs {
  /** Identificador corto de cada tabla → id del nodo. */
  tables: Record<string, string>;
}

export const AI_CONTEXT_MAX_ISSUES = 50;

function originText(c: TableColumn) {
  if (c.origin.kind === 'library') return 'preforma';
  if (c.origin.kind === 'inherited') return `heredada de ${c.origin.from.name}`;
  return 'propia';
}

/**
 * Contexto del esquema de un proyecto. Con `focusNodeIds`, solo esas tablas van completas; las
 * demás llevan su clave primaria, para que el modelo pueda apuntarles una FK.
 */
export function databaseContext(
  p: Project,
  focusNodeIds?: readonly string[],
): { context: AiDatabaseContext; refs: AiContextRefs } {
  const tableNodes = p.nodes.filter(n => isTableType(p, n.typeId));
  const idOf = new Map(tableNodes.map((n, i) => [n.id, `t${i + 1}`]));
  const focus = focusNodeIds?.length ? new Set(focusNodeIds) : null;
  const byType = new Map<string, Node[]>();
  tableNodes.forEach(n => byType.set(n.typeId, [...(byType.get(n.typeId) ?? []), n]));

  const tables = tableNodes.map((node): AiTableContext => {
    const schema = getSchema(p, node.typeId);
    const partial = focus !== null && !focus.has(node.id);
    const columns = tableColumns(p, node.typeId)
      .filter(c => !partial || c.sql.primaryKey)
      .map((c): AiColumnContext => {
        const target = c.field.type === 'nodeRef' ? node.values[c.field.id] : undefined;
        return {
          name: c.field.key || c.field.label,
          type: sqlTypeText(c.type),
          primaryKey: c.sql.primaryKey,
          nullable: c.sql.nullable,
          unique: c.sql.unique,
          identity: c.sql.identity,
          references: typeof target === 'string' ? (idOf.get(target) ?? null) : null,
          origin: originText(c),
          description: c.field.description,
        };
      });
    return {
      id: idOf.get(node.id)!,
      name: nodeLabel(p, node),
      typeName: schema?.name ?? '',
      description: schema?.description ?? '',
      sharesColumnsWith: (byType.get(node.typeId) ?? []).filter(n => n.id !== node.id).map(n => idOf.get(n.id)!),
      partial,
      columns,
    };
  });

  return {
    context: {
      projectName: p.name,
      tables,
      issues: databaseLint(p)
        .slice(0, AI_CONTEXT_MAX_ISSUES)
        .map(issue => issue.message),
    },
    refs: { tables: Object.fromEntries([...idOf].map(([nodeId, id]) => [id, nodeId])) },
  };
}
