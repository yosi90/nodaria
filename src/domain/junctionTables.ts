import { engineOf, isTableNode, type SqlColumn } from './database';
import { createField, createSchema, now, uid } from './factories';
import { slugify } from './text';
import { allFields, nodeLabel } from './selectors';
import type { FieldDefinition, Node, Project, Schema } from './types';

/*
 * Tablas intermedias (docs/roadmaps/ROADMAP_DIAGRAMAS_BD.md, hito 4). En un diseño de base de datos, una
 * referencia múltiple de una tabla a otras es una relación muchos a muchos: no cabe en una columna y
 * necesita una tabla intermedia con una clave foránea a cada lado. Aquí se proponen (una por cada par
 * tabla-tabla de la referencia) y, si el usuario las acepta, se crean: un tipo tabla por tabla
 * intermedia, con su nombre como título y las dos claves foráneas como clave primaria compuesta, y su
 * nodo. Nada se deduce como hecho: el usuario ve la propuesta, cambia los nombres y decide.
 */

export interface JunctionProposal {
  /** Nodo tabla con la referencia múltiple. */
  sourceId: string;
  fieldId: string;
  /** Nodo tabla al que apunta. */
  targetId: string;
  /** Nombre propuesto de la tabla intermedia (editable). */
  name: string;
}

/** Las tablas intermedias que harían falta para las referencias múltiples entre tablas. */
export function junctionProposals(p: Project, filter?: { typeId?: string; fieldId?: string }): JunctionProposal[] {
  const proposals: JunctionProposal[] = [];
  for (const source of p.nodes) {
    if (!isTableNode(p, source) || (filter?.typeId && source.typeId !== filter.typeId)) continue;
    for (const field of allFields(p, source.typeId)) {
      if (field.type !== 'nodeRefs' || (filter?.fieldId && field.id !== filter.fieldId)) continue;
      const ids = source.values[field.id];
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        const target = p.nodes.find(n => n.id === id);
        if (!target || !isTableNode(p, target)) continue;
        proposals.push({
          sourceId: source.id,
          fieldId: field.id,
          targetId: target.id,
          name: `${nodeLabel(p, source)}_${nodeLabel(p, target)}`,
        });
      }
    }
  }
  return proposals;
}

const KEY: SqlColumn = {
  type: null,
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: false,
  excluded: false,
};

function foreignKey(label: string, key: string, typeId: string): FieldDefinition {
  return {
    ...createField(),
    key,
    label,
    type: 'nodeRef',
    required: true,
    referenceTypeIds: [typeId],
    sql: KEY,
  };
}

/**
 * Crea las tablas intermedias aceptadas. Con `removeReference`, quita de cada referencia múltiple los
 * destinos ya convertidos (la relación pasa a vivir en la tabla intermedia).
 */
export function createJunctionTables(p: Project, accepted: JunctionProposal[], removeReference: boolean): Project {
  const schemas: Schema[] = [];
  const nodes: Node[] = [];
  const converted = new Map<string, Set<string>>();
  for (const proposal of accepted) {
    const source = p.nodes.find(n => n.id === proposal.sourceId);
    const target = p.nodes.find(n => n.id === proposal.targetId);
    const name = proposal.name.trim();
    if (!source || !target || !name) continue;
    const sourceName = nodeLabel(p, source);
    const targetName = nodeLabel(p, target);
    const sourceKey = `id_${slugify(sourceName) || 'origen'}`;
    let targetKey = `id_${slugify(targetName) || 'destino'}`;
    if (targetKey === sourceKey) targetKey = `${targetKey}_2`;
    const title: FieldDefinition = { ...createField(), key: 'nombre', label: 'Nombre', isTitle: true, required: true };
    const fromKey = foreignKey(`Id ${sourceName}`, sourceKey, source.typeId);
    const toKey = foreignKey(`Id ${targetName}`, targetKey, target.typeId);
    const schema: Schema = {
      ...createSchema(name, 'entity'),
      icon: 'table-2',
      table: true,
      // En la misma base que las tablas que une (SQL Server por defecto, o Db2 for i).
      dbEngine: engineOf(p, source.typeId) === 'db2i' ? 'db2i' : null,
      description: `Tabla intermedia de la relación muchos a muchos entre «${sourceName}» y «${targetName}».`,
      fields: [title, fromKey, toKey],
    };
    schemas.push(schema);
    nodes.push({
      id: uid('node'),
      typeId: schema.id,
      parentId: null,
      values: { [title.id]: name, [fromKey.id]: source.id, [toKey.id]: target.id },
      createdAt: now(),
      positions: {},
      notes: '',
    });
    const key = `${source.id}\u0000${proposal.fieldId}`;
    converted.set(key, (converted.get(key) ?? new Set()).add(target.id));
  }
  if (!schemas.length) return p;
  const existing = removeReference
    ? p.nodes.map(node => {
        let values = node.values;
        for (const [key, targets] of converted) {
          const [sourceId, fieldId] = key.split('\u0000');
          if (sourceId !== node.id || !Array.isArray(values[fieldId])) continue;
          const kept = (values[fieldId] as string[]).filter(id => !targets.has(id));
          values = { ...values };
          if (kept.length) values[fieldId] = kept;
          else delete values[fieldId];
        }
        return values === node.values ? node : { ...node, values };
      })
    : p.nodes;
  return { ...p, schemas: [...p.schemas, ...schemas], nodes: [...existing, ...nodes] };
}
