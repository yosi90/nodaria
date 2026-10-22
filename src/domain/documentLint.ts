import { engineLabel, engineOf, isDatabaseType, isEmbeddedType, tableColumns, type TableColumn } from './database';
import { isDocumentEngine } from './dbEngines';
import { getSchema, nodeLabel } from './selectors';
import type { Node, Project, Schema } from './types';

/*
 * Revisión de las bases de documentos y de grafos (docs/roadmaps/ROADMAP_NOSQL.md), junto a la de SQL en
 * «Esquema de base de datos» de Salud. Lo que un mapa deja ver de un vistazo y luego cuesta caro: qué se
 * incrusta y qué se referencia.
 */

export interface DocumentLintIssue {
  severity: 'error' | 'warning';
  message: string;
  schema?: Schema;
  node?: Node;
}

/** A partir de cuántos niveles de subdocumentos se avisa. */
const DEEP = 3;
/** En cuántas colecciones se puede incrustar el mismo subdocumento antes de avisar de posible duplicado. */
const SHARED = 3;

const embeddedColumns = (p: Project, typeId: string) =>
  tableColumns(p, typeId).filter(c => c.refKind === 'embedded' && c.target);

/** Niveles de subdocumentos que cuelgan de un tipo, o `Infinity` si hay un ciclo. */
function depthOf(p: Project, typeId: string, open: Set<string>): number {
  let deepest = 0;
  for (const c of embeddedColumns(p, typeId)) {
    if (open.has(c.target!.id)) return Infinity;
    deepest = Math.max(deepest, 1 + depthOf(p, c.target!.id, new Set([...open, c.target!.id])));
  }
  return deepest;
}

export function documentLint(p: Project): DocumentLintIssue[] {
  const issues: DocumentLintIssue[] = [];
  const types = p.schemas.filter(
    s => s.kind === 'entity' && !s.isAbstract && isDatabaseType(p, s.id) && engineOf(p, s.id) !== 'sqlserver',
  );
  const collections = types.filter(s => !isEmbeddedType(p, s.id));
  const label = (s: Schema, c: TableColumn) => `${s.name}.${c.field.key || c.field.label}`;

  // Por tipo: ciclos y profundidad de incrustación, listas incrustadas y referencias sin destino.
  for (const schema of types) {
    const engine = engineOf(p, schema.id)!;
    if (!tableColumns(p, schema.id).length)
      issues.push({ severity: 'warning', message: `${schema.name}: no tiene campos.`, schema });
    const depth = depthOf(p, schema.id, new Set([schema.id]));
    if (depth === Infinity)
      issues.push({
        severity: 'error',
        message: `${schema.name}: se incrusta a sí mismo a través de sus subdocumentos; ese documento no tendría fin.`,
        schema,
      });
    else if (depth > DEEP && !isEmbeddedType(p, schema.id))
      issues.push({
        severity: 'warning',
        message: `${schema.name}: sus documentos tienen ${depth} niveles de subdocumentos; cuesta consultarlos y actualizarlos.`,
        schema,
      });
    for (const c of tableColumns(p, schema.id).filter(x => x.reference)) {
      if (!c.target)
        issues.push({
          severity: 'warning',
          message: `${label(schema, c)}: no apunta a ningún tipo de base de datos; elige en el atributo a qué tipo apunta.`,
          schema,
        });
      else if (c.refKind === 'embedded' && c.field.type === 'nodeRefs' && engine === 'mongodb')
        issues.push({
          severity: 'warning',
          message: `${label(schema, c)}: lista de «${c.target.name}» incrustada; si crece sin límite, el documento puede pasar de los 16 MB de MongoDB. Si son muchos, mejor en su colección con una referencia.`,
          schema,
        });
      else if (c.refKind === 'embedded' && c.field.type === 'nodeRefs' && engine === 'firestore')
        issues.push({
          severity: 'warning',
          message: `${label(schema, c)}: lista de «${c.target.name}» incrustada; un documento de Firestore admite 1 MiB y las reglas no validan cada elemento. Si son muchos, mejor una subcolección.`,
          schema,
        });
      else if (c.crossEngine)
        issues.push({
          severity: 'warning',
          message: `${label(schema, c)}: apunta a «${c.target.name}», de ${engineLabel(engineOf(p, c.target.id)!)}; entre bases distintas nadie comprueba la referencia: la mantiene tu aplicación.`,
          schema,
        });
    }
  }

  // Un subdocumento incrustado en muchas colecciones: los mismos datos copiados en varios sitios.
  const embeddedIn = new Map<string, Set<string>>();
  for (const schema of collections)
    for (const c of embeddedColumns(p, schema.id))
      embeddedIn.set(c.target!.id, (embeddedIn.get(c.target!.id) ?? new Set()).add(schema.name));
  embeddedIn.forEach((owners, typeId) => {
    if (owners.size >= SHARED)
      issues.push({
        severity: 'warning',
        message: `«${getSchema(p, typeId)?.name}» va incrustado en ${owners.size} colecciones (${[...owners].join(', ')}); si son los mismos datos, al cambiar habrá que cambiarlos en todas. Valora una colección propia.`,
        schema: getSchema(p, typeId),
      });
  });

  // Nombres repetidos de colección o etiqueta en el mismo motor.
  const byName = new Map<string, Node[]>();
  p.nodes
    .filter(n => {
      const engine = engineOf(p, n.typeId);
      return engine && engine !== 'sqlserver' && !isEmbeddedType(p, n.typeId);
    })
    .forEach(n => {
      const key = `${engineOf(p, n.typeId)}|${isDocumentEngine(engineOf(p, n.typeId)) ? (n.parentId ?? '') : ''}|${nodeLabel(p, n).trim().toLowerCase()}`;
      byName.set(key, [...(byName.get(key) ?? []), n]);
    });
  byName.forEach(list => {
    if (list.length > 1) {
      const engine = engineOf(p, list[0].typeId)!;
      issues.push({
        severity: 'error',
        message: `${list.length} ${engine === 'neo4j' ? 'etiquetas' : 'colecciones'} de ${engineLabel(engine)} se llaman «${nodeLabel(p, list[0])}».`,
        node: list[1],
      });
    }
  });
  return issues;
}
