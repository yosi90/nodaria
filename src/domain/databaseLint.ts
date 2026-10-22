import {
  engineLabel,
  engineOf,
  foreignKeyLinks,
  isDatabaseType,
  isTableType,
  sqlTypeText,
  tableColumns,
  tableIssues,
  tableTypes,
} from './database';
import { documentLint } from './documentLint';
import { getSchema, nodeLabel } from './selectors';
import type { Node, Project, Schema } from './types';

/*
 * Revisión del esquema de base de datos para «Salud»: los avisos de cada tabla (sin clave primaria,
 * tipos fuera de rango…) y los que solo se ven al mirar el conjunto: nombres de tabla repetidos,
 * referencias que no llevan a ninguna tabla y ciclos de claves foráneas.
 */

export interface DatabaseLintIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Tipo tabla al que llevar al pulsar, o nodo. */
  schema?: Schema;
  node?: Node;
}

/** Ciclos de claves foráneas entre tablas distintas (componentes fuertemente conexos de Tarjan). */
export function foreignKeyCycles(p: Project): string[][] {
  const edges = new Map<string, string[]>();
  foreignKeyLinks(p).forEach(l => {
    if (l.sourceId !== l.targetId) edges.set(l.sourceId, [...(edges.get(l.sourceId) ?? []), l.targetId]);
  });
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let counter = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter++);
    stack.push(v);
    onStack.add(v);
    (edges.get(v) ?? []).forEach(w => {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    });
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) result.push(component.reverse());
    }
  };
  [...edges.keys()].forEach(v => !index.has(v) && visit(v));
  return result;
}

export function databaseLint(p: Project): DatabaseLintIssue[] {
  const issues: DatabaseLintIssue[] = [];
  // SQL Server rechaza las acciones en cascada (CASCADE, SET NULL, SET DEFAULT) en una autorreferencia o
  // en un ciclo de claves foráneas: «may cause cycles or multiple cascade paths».
  const cycles = foreignKeyCycles(p);
  for (const link of foreignKeyLinks(p)) {
    const source = p.nodes.find(n => n.id === link.sourceId);
    if (!source) continue;
    const column = tableColumns(p, source.typeId).find(c => c.field.id === link.fieldId);
    const acts = [column?.sql.onDelete, column?.sql.onUpdate].some(a => a && a !== 'NO ACTION');
    if (!column || !acts) continue;
    const inCycle =
      link.sourceId === link.targetId ||
      cycles.some(cycle => cycle.includes(link.sourceId) && cycle.includes(link.targetId));
    if (inCycle)
      issues.push({
        severity: 'error',
        message: `${nodeLabel(p, source)}: «${column.field.label}» no puede borrar ni actualizar en cascada dentro de un ciclo o una autorreferencia; SQL Server lo rechaza. Deja «NO ACTION».`,
        node: source,
      });
  }
  const tables = tableTypes(p).filter(s => !s.isAbstract);
  tables.forEach(schema =>
    tableIssues(p, schema.id).forEach(issue =>
      issues.push({ severity: issue.severity, message: `${schema.name}: ${issue.message}`, schema }),
    ),
  );

  const tableNodes = p.nodes.filter(n => isTableType(p, n.typeId));
  const names = new Map<string, Node[]>();
  tableNodes.forEach(n => {
    const key = nodeLabel(p, n).trim().toLowerCase();
    names.set(key, [...(names.get(key) ?? []), n]);
  });
  names.forEach(list => {
    if (list.length > 1)
      issues.push({
        severity: 'error',
        message: `${list.length} tablas se llaman «${nodeLabel(p, list[0])}»; el script SQL las numerará.`,
        node: list[1],
      });
  });

  const nodes = new Map(p.nodes.map(n => [n.id, n]));
  tableNodes.forEach(node => {
    tableColumns(p, node.typeId)
      .filter(c => c.field.type === 'nodeRef')
      .forEach(c => {
        const value = node.values[c.field.id];
        const target = typeof value === 'string' ? nodes.get(value) : undefined;
        if (!target)
          issues.push({
            severity: 'warning',
            message: `${nodeLabel(p, node)}.${c.field.key}: no apunta a ninguna tabla, así que no es clave foránea.`,
            node,
          });
        else if (!isTableType(p, target.typeId))
          issues.push({
            severity: 'warning',
            message: isDatabaseType(p, target.typeId)
              ? `${nodeLabel(p, node)}.${c.field.key}: apunta a «${nodeLabel(p, target)}», de ${engineLabel(engineOf(p, target.typeId)!)}; entre bases distintas no hay clave foránea: la referencia la mantiene tu aplicación.`
              : `${nodeLabel(p, node)}.${c.field.key}: apunta a «${nodeLabel(p, target)}», que no es una tabla.`,
            node,
          });
      });
  });

  foreignKeyLinks(p).forEach(l => {
    const source = nodes.get(l.sourceId)!;
    const target = nodes.get(l.targetId)!;
    const column = tableColumns(p, source.typeId).find(c => c.field.id === l.fieldId);
    const key = tableColumns(p, target.typeId).find(c => c.field.id === l.targetFieldId);
    // Hacia una clave primaria compuesta, el script abre la referencia en una columna por parte: vale.
    // Lo que no vale es apuntar a una tabla sin clave primaria.
    if (!l.targetFieldId && !tableColumns(p, target.typeId).some(c => c.sql.primaryKey))
      issues.push({
        severity: 'error',
        message: `${nodeLabel(p, source)}.${column?.field.key}: «${nodeLabel(p, target)}» no tiene clave primaria a la que apuntar.`,
        node: source,
      });
    else if (column && key && sqlTypeText(column.type) !== sqlTypeText(key.type))
      issues.push({
        severity: 'error',
        message: `${nodeLabel(p, source)}.${column.field.key} es ${sqlTypeText(column.type)}, pero apunta a una clave ${sqlTypeText(key.type)}.`,
        node: source,
      });
  });

  foreignKeyCycles(p).forEach(cycle => {
    const labels = cycle.map(id => nodeLabel(p, nodes.get(id)!));
    const members = new Set(cycle);
    // Si alguna clave del ciclo admite nulos, se puede insertar primero esa fila y completarla después.
    const breakable = foreignKeyLinks(p)
      .filter(l => members.has(l.sourceId) && members.has(l.targetId))
      .some(l => tableColumns(p, nodes.get(l.sourceId)!.typeId).find(c => c.field.id === l.fieldId)?.sql.nullable);
    issues.push({
      severity: breakable ? 'warning' : 'error',
      message: `Referencias cíclicas: ${labels.join(' → ')} → ${labels[0]}. ${
        breakable
          ? 'Alguna de sus claves foráneas admite nulos: inserta primero esa fila y complétala después.'
          : 'Ninguna de sus claves foráneas admite nulos, así que no se podría insertar ninguna fila.'
      }`,
      node: nodes.get(cycle[0]),
      schema: getSchema(p, nodes.get(cycle[0])!.typeId),
    });
  });
  // Las bases de documentos y de grafos (ROADMAP_NOSQL.md).
  issues.push(...documentLint(p));
  return issues;
}
