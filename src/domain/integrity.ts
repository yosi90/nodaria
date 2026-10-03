import { getSchema } from './selectors';
import type { Project, Schema } from './types';

export interface RepairResult {
  project: Project;
  /** Descripción legible de cada corrección aplicada; vacía si el proyecto estaba sano. */
  issues: string[];
}

/**
 * Corrige incoherencias que la aplicación no debería poder producir pero que existen en datos
 * antiguos o importados: ciclos de herencia y jerarquía, padres y extremos inexistentes y
 * restricciones que apuntan a tipos borrados. Nunca elimina nodos.
 */
export function repairProject(input: Project): RepairResult {
  const issues: string[] = [];
  let p = input;
  const typeIds = new Set(p.schemas.map(s => s.id));
  const schemaName = (id: string) => getSchema(input, id)?.name ?? id;

  // Restricciones con tipos inexistentes.
  let danglingTypeRefs = 0;
  const cleanList = (list: string[]) => {
    const next = list.filter(id => typeIds.has(id));
    danglingTypeRefs += list.length - next.length;
    return next.length === list.length ? list : next;
  };
  p = {
    ...p,
    schemas: p.schemas.map(s => {
      const next: Schema = {
        ...s,
        allowedChildTypeIds: cleanList(s.allowedChildTypeIds),
        sourceTypeIds: cleanList(s.sourceTypeIds),
        targetTypeIds: cleanList(s.targetTypeIds),
        fields: s.fields.map(f => {
          const referenceTypeIds = cleanList(f.referenceTypeIds);
          return referenceTypeIds === f.referenceTypeIds ? f : { ...f, referenceTypeIds };
        }),
      };
      return next;
    }),
  };
  if (danglingTypeRefs) issues.push(`Se quitaron ${danglingTypeRefs} referencias a tipos que ya no existen.`);

  // Herencia: padres inexistentes, de otra clase o en ciclo.
  const schemas = new Map(p.schemas.map(s => [s.id, s]));
  for (const schema of p.schemas) {
    const parent = schema.parentTypeId ? schemas.get(schema.parentTypeId) : undefined;
    if (schema.parentTypeId && (!parent || parent.kind !== schema.kind)) {
      schemas.set(schema.id, { ...schemas.get(schema.id)!, parentTypeId: null });
      issues.push(
        `El tipo “${schema.name}” heredaba de un tipo inexistente o incompatible; ahora no hereda de ninguno.`,
      );
    }
  }
  for (const id of schemas.keys()) {
    const seen = new Set<string>();
    let cur = schemas.get(id);
    while (cur?.parentTypeId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = schemas.get(cur.parentTypeId);
      if (parent && seen.has(parent.id)) {
        schemas.set(cur.id, { ...cur, parentTypeId: null });
        issues.push(`Se rompió un ciclo de herencia: “${cur.name}” ya no hereda de “${parent.name}”.`);
        break;
      }
      cur = parent;
    }
  }
  p = { ...p, schemas: p.schemas.map(s => schemas.get(s.id)!) };

  // Jerarquía: padres inexistentes, autorreferencias y ciclos.
  const nodes = new Map(p.nodes.map(n => [n.id, n]));
  for (const node of p.nodes) {
    if (node.parentId && (node.parentId === node.id || !nodes.has(node.parentId))) {
      nodes.set(node.id, { ...node, parentId: null });
      issues.push(`Un nodo de tipo “${schemaName(node.typeId)}” tenía un padre inexistente y se ha movido a la raíz.`);
    }
  }
  for (const id of nodes.keys()) {
    const seen = new Set<string>();
    let cur = nodes.get(id);
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = nodes.get(cur.parentId);
      if (parent && seen.has(parent.id)) {
        nodes.set(cur.id, { ...cur, parentId: null });
        issues.push(
          `Se rompió un ciclo en la jerarquía: un nodo de tipo “${schemaName(cur.typeId)}” se ha movido a la raíz.`,
        );
        break;
      }
      cur = parent;
    }
  }
  p = { ...p, nodes: p.nodes.map(n => nodes.get(n.id)!) };

  // Relaciones con extremos inexistentes (invisibles e ineditables).
  const relations = p.relations.filter(r => nodes.has(r.sourceId) && nodes.has(r.targetId));
  if (relations.length !== p.relations.length) {
    issues.push(
      `Se eliminaron ${p.relations.length - relations.length} relaciones que apuntaban a nodos inexistentes.`,
    );
    p = { ...p, relations };
  }

  return { project: issues.length ? p : input, issues };
}
