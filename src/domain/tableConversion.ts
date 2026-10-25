import { isDatabaseType, isEmbeddedType, engineOf, sqlType, type SqlColumn, type SqlDialect } from './database';
import { isDocumentEngine } from './dbEngines';
import { createField, now, uid } from './factories';
import { createJunctionTables, junctionProposals } from './junctionTables';
import { isFieldLink } from './library';
import { allFields, getSchema } from './selectors';
import { slugify } from './text';
import type { FieldDefinition, FieldValue, Node, Project, Schema } from './types';

/*
 * Pasar documentos a tablas (docs/roadmaps/ROADMAP_NOSQL.md, el camino contrario a `documentConversion.ts`):
 * las colecciones de MongoDB o Firestore elegidas pasan a ser tablas de SQL Server o Db2.
 *
 * - Una **colección** es una tabla; si no tiene clave primaria, gana `id` (IDENTITY), como el `_id`.
 * - Un **subdocumento en lista** (las líneas de un pedido) pasa a ser una tabla hija con una clave foránea
 *   hacia la tabla padre (sin nulos y que se borra en cascada); la lista del padre sobra.
 * - Un **subdocumento en objeto** (la dirección de envío) se **aplana** en columnas del padre
 *   (`envio_calle`, `envio_cp`) si es pequeño y solo lo usa ese padre; si no, una tabla aparte uno a uno.
 * - Una **lista de ids** hacia otra colección es una relación muchos a muchos: se crean sus tablas
 *   intermedias (`junctionTables.ts`), si se pide.
 */

/** Un subdocumento aplanado no pasa de estas columnas. */
const FLATTEN_MAX = 8;

export interface SubdocumentUse {
  /** El tipo que lo lleva dentro y el atributo que lo incrusta. */
  parentTypeId: string;
  fieldId: string;
  many: boolean;
}
export interface SubdocumentSuggestion {
  typeId: string;
  name: string;
  uses: SubdocumentUse[];
  /** Columnas en el padre (solo si es un objeto) o una tabla. */
  flatten: boolean;
  canFlatten: boolean;
  reason: string;
}
export interface TableConversionChoices {
  /** Nodos de las colecciones que pasan a tablas. */
  nodeIds: string[];
  /** Por subdocumento: aplanarlo (si se puede) o hacerlo tabla. */
  flatten: Record<string, boolean>;
  /** Crear las tablas intermedias de las listas de referencias. */
  junctions: boolean;
}

const isCollectionNode = (p: Project, n: Node) =>
  isDatabaseType(p, n.typeId) && isDocumentEngine(engineOf(p, n.typeId)) && !isEmbeddedType(p, n.typeId);

/** Las colecciones de documentos del proyecto (sus nodos). */
export const documentCollections = (p: Project) => p.nodes.filter(n => isCollectionNode(p, n));

/** Los subdocumentos que llevan dentro esos tipos (también los de dentro de otros subdocumentos). */
function subdocumentsOf(p: Project, typeIds: string[]) {
  const uses = new Map<string, SubdocumentUse[]>();
  const queue = [...typeIds];
  const seen = new Set(queue);
  while (queue.length) {
    const typeId = queue.shift()!;
    allFields(p, typeId).forEach(f => {
      if (f.type !== 'nodeRef' && f.type !== 'nodeRefs') return;
      const target = f.referenceTypeIds.map(id => getSchema(p, id)).find(s => s && isEmbeddedType(p, s.id));
      if (!target) return;
      uses.set(target.id, [
        ...(uses.get(target.id) ?? []),
        { parentTypeId: typeId, fieldId: f.id, many: f.type === 'nodeRefs' },
      ]);
      if (!seen.has(target.id)) {
        seen.add(target.id);
        queue.push(target.id);
      }
    });
  }
  return uses;
}

/** Qué se hará con cada subdocumento de las colecciones elegidas, con el motivo. */
export function suggestTables(p: Project, nodeIds: string[]): SubdocumentSuggestion[] {
  const typeIds = [...new Set(p.nodes.filter(n => nodeIds.includes(n.id)).map(n => n.typeId))];
  return [...subdocumentsOf(p, typeIds)].map(([typeId, uses]) => {
    const schema = getSchema(p, typeId)!;
    const fields = allFields(p, typeId).filter(f => !f.isTitle);
    const nested = fields.some(f => f.referenceTypeIds.some(id => isEmbeddedType(p, id)));
    const canFlatten = uses.length === 1 && !uses[0].many && !nested;
    const flatten = canFlatten && fields.length <= FLATTEN_MAX;
    const parent = getSchema(p, uses[0].parentTypeId)?.name ?? '';
    const reason = uses.some(u => u.many)
      ? `Es una lista dentro de ${parent}: una tabla con una clave foránea hacia ${parent}.`
      : uses.length > 1
        ? 'Va dentro de varios documentos: una tabla aparte, a la que apuntan.'
        : nested
          ? 'Lleva otros subdocumentos dentro: una tabla aparte, uno a uno.'
          : flatten
            ? `Un objeto pequeño dentro de ${parent}: sus campos pasan a ser columnas de ${parent}.`
            : `Un objeto grande dentro de ${parent}: una tabla aparte, uno a uno.`;
    return { typeId, name: schema.name, uses, flatten, canFlatten, reason };
  });
}

const slug = (text: string) => slugify(text) || 'campo';

function freeKey(taken: Set<string>, base: string) {
  let key = base;
  for (let i = 2; taken.has(key.toLowerCase()); i++) key = `${base}_${i}`;
  taken.add(key.toLowerCase());
  return key;
}

const pkColumn = (): SqlColumn => ({
  type: sqlType('int'),
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
});

/** Quita un atributo de un tipo: el propio se borra; el heredado o de la biblioteca, se oculta en él. */
function withoutField(s: Schema, fieldId: string): Schema {
  const own = s.fields.some(f => !isFieldLink(f) && f.id === fieldId);
  return own
    ? { ...s, fields: s.fields.filter(f => isFieldLink(f) || f.id !== fieldId) }
    : { ...s, hiddenFieldIds: [...new Set([...s.hiddenFieldIds, fieldId])] };
}

export function convertToTables(p: Project, dialect: SqlDialect, choices: TableConversionChoices) {
  const warnings: string[] = [];
  const collections = p.nodes.filter(n => choices.nodeIds.includes(n.id) && isCollectionNode(p, n));
  const collectionTypes = [...new Set(collections.map(n => n.typeId))];
  const suggestions = suggestTables(
    p,
    collections.map(n => n.id),
  );
  const schemas = new Map(p.schemas.map(s => [s.id, s]));
  const update = (id: string, change: (s: Schema) => Schema) => schemas.set(id, change(schemas.get(id)!));
  const newNodes: Node[] = [];
  const values = new Map<string, Record<string, FieldValue>>();
  const setValue = (nodeId: string, fieldId: string, value: FieldValue) =>
    values.set(nodeId, { ...(values.get(nodeId) ?? {}), [fieldId]: value });
  /** El nodo (la tabla) de cada tipo: el de la colección, o uno nuevo para el subdocumento que pasa a tabla. */
  const nodeOf = new Map<string, string>();
  collections.forEach(n => nodeOf.has(n.typeId) || nodeOf.set(n.typeId, n.id));

  // Las colecciones, tablas; si no tienen clave primaria, una «id» como su _id.
  collectionTypes.forEach(typeId =>
    update(typeId, s => {
      const fields = allFields(p, typeId);
      const hasKey = fields.some(f => f.sql?.primaryKey || s.sqlOverrides[f.id]?.primaryKey);
      const taken = new Set(fields.map(f => f.key.toLowerCase()));
      const id: FieldDefinition = {
        ...createField(),
        key: freeKey(taken, 'id'),
        label: 'id',
        type: 'number',
        sql: pkColumn(),
      };
      return { ...s, table: true, dbEngine: dialect, fields: hasKey ? s.fields : [id, ...s.fields] };
    }),
  );
  collectionTypes
    .filter(typeId => p.nodes.filter(n => n.typeId === typeId).length > 1)
    .forEach(typeId =>
      warnings.push(
        `${getSchema(p, typeId)?.name}: su tipo tiene varias colecciones; los subdocumentos van con la primera.`,
      ),
    );

  // Los subdocumentos: primero las tablas nuevas (para que las claves foráneas encuentren su nodo).
  const asTable = suggestions.filter(s => !(s.canFlatten && (choices.flatten[s.typeId] ?? s.flatten)));
  asTable.forEach(s => {
    const node: Node = {
      id: uid('node'),
      typeId: s.typeId,
      parentId: null,
      values: {},
      createdAt: now(),
      positions: {},
      notes: '',
    };
    newNodes.push(node);
    nodeOf.set(s.typeId, node.id);
  });
  asTable.forEach(s => {
    update(s.typeId, schema => {
      const fields = allFields(p, s.typeId);
      const taken = new Set(fields.map(f => f.key.toLowerCase()));
      const hasKey = fields.some(f => f.sql?.primaryKey);
      const added: FieldDefinition[] = hasKey
        ? []
        : [{ ...createField(), key: freeKey(taken, 'id'), label: 'id', type: 'number', sql: pkColumn() }];
      // Una clave foránea hacia cada documento que lo lleva dentro.
      s.uses.forEach(use => {
        const parent = getSchema(p, use.parentTypeId)!;
        const fk: FieldDefinition = {
          ...createField(),
          key: freeKey(taken, `${slug(parent.name)}_id`),
          label: parent.name,
          type: 'nodeRef',
          referenceTypeIds: [parent.id],
          sql: {
            type: null,
            // En una lista, una clave propia (el número de línea) solo es única dentro de su padre: la
            // clave primaria pasa a ser compuesta, con la del padre.
            primaryKey: use.many && hasKey && s.uses.length === 1,
            nullable: s.uses.length > 1,
            unique: !use.many,
            identity: false,
            excluded: false,
            onDelete: 'CASCADE',
          },
        };
        added.push(fk);
        const parentNode = nodeOf.get(use.parentTypeId);
        if (parentNode) setValue(nodeOf.get(s.typeId)!, fk.id, parentNode);
      });
      return { ...schema, embedded: false, table: true, dbEngine: dialect, fields: [...added, ...schema.fields] };
    });
    // En el padre sobra la referencia que lo incrustaba: ahora la tabla hija apunta al padre.
    s.uses.forEach(use => update(use.parentTypeId, parent => withoutField(parent, use.fieldId)));
  });

  // Los objetos pequeños: sus campos pasan a ser columnas del padre.
  suggestions
    .filter(s => s.canFlatten && (choices.flatten[s.typeId] ?? s.flatten))
    .forEach(s => {
      const use = s.uses[0];
      const reference = allFields(p, use.parentTypeId).find(f => f.id === use.fieldId)!;
      update(use.parentTypeId, parent => {
        const taken = new Set(allFields(p, use.parentTypeId).map(f => f.key.toLowerCase()));
        const columns = allFields(p, s.typeId)
          .filter(f => !f.isTitle)
          .map(f => ({
            ...f,
            id: uid('field'),
            key: freeKey(taken, `${reference.key}_${f.key}`),
            label: `${reference.label} · ${f.label}`,
            required: false,
            sql: f.sql ? { ...f.sql, primaryKey: false, identity: false, nullable: true, unique: false } : null,
          }));
        const position = parent.fields.findIndex(f => !isFieldLink(f) && f.id === use.fieldId);
        const base = withoutField(parent, use.fieldId);
        const fields = [...base.fields];
        fields.splice(position >= 0 ? position : fields.length, 0, ...columns);
        return { ...base, fields };
      });
      // El tipo del subdocumento ya no lo usa nadie: se borra si no lo usa ningún otro tipo.
      const usedElsewhere = p.schemas.some(
        other =>
          other.id !== use.parentTypeId &&
          other.fields.some(f => !isFieldLink(f) && f.referenceTypeIds.includes(s.typeId)),
      );
      if (
        !usedElsewhere &&
        !p.schemas.some(other => other.parentTypeId === s.typeId) &&
        !p.nodes.some(n => n.typeId === s.typeId)
      )
        schemas.delete(s.typeId);
    });

  let next: Project = {
    ...p,
    schemas: p.schemas.filter(s => schemas.has(s.id)).map(s => schemas.get(s.id)!),
    nodes: [
      ...p.nodes.map(n => (values.has(n.id) ? { ...n, values: { ...n.values, ...values.get(n.id) } } : n)),
      ...newNodes.map(n => ({ ...n, values: values.get(n.id) ?? {} })),
    ],
  };

  // Las listas de ids hacia otras colecciones: sus tablas intermedias.
  const typeIds = new Set([...collectionTypes, ...asTable.map(s => s.typeId)]);
  const proposals = junctionProposals(next).filter(x =>
    typeIds.has(next.nodes.find(n => n.id === x.sourceId)?.typeId ?? ''),
  );
  if (proposals.length && choices.junctions) next = createJunctionTables(next, proposals, true);
  else if (proposals.length)
    warnings.push(
      `${proposals.length} ${proposals.length === 1 ? 'lista de referencias necesita' : 'listas de referencias necesitan'} una tabla intermedia: «Proponer tablas intermedias» en «Columnas SQL».`,
    );
  return {
    project: next,
    tables: collections.length + asTable.length,
    junctions: choices.junctions ? proposals.length : 0,
    warnings,
  };
}
