import { createField, now, uid } from './factories';
import { normalizeName } from './notes';
import { defaultValues } from './operations';
import { allFields, canContain, nodeLabel } from './selectors';
import type { FieldDefinition, FieldValue, Node, Project } from './types';
import { convertValue } from './valueConversion';

/*
 * Importar nodos desde un CSV (PENDIENTES.md, Fase 7): cada fila es un nodo del tipo elegido y cada
 * columna va al título, a «Dentro de», a las notas, a un atributo o a ninguna parte. Los valores se
 * convierten desde texto con las reglas de `valueConversion.ts`; «Dentro de» se resuelve por título
 * entre los nodos del proyecto y los importados. Todo en un solo paso deshacible.
 */

export interface CsvTable {
  header: string[];
  rows: string[][];
}

/** Lee un CSV con «;» o «,» (el que más aparezca en la cabecera), comillas dobles y BOM. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  const nonEmpty = records.filter(r => r.some(c => c.trim()));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map(h => h.trim()), rows };
}

/** A dónde va una columna: el título, «Dentro de», las notas, un atributo (su id) o nada. */
export type ColumnTarget =
  { kind: 'title' } | { kind: 'parent' } | { kind: 'notes' } | { kind: 'field'; fieldId: string } | null;

/** Propuesta de correspondencia por el nombre de cada columna. */
export function guessMapping(p: Project, typeId: string, header: string[]): ColumnTarget[] {
  const fields = allFields(p, typeId);
  const title = fields.find(f => f.isTitle);
  const taken = new Set<string>();
  return header.map(name => {
    const n = normalizeName(name);
    if (['titulo', 'title', 'nombre'].includes(n) && !taken.has('title')) {
      // «Nombre» puede ser también un atributo título; si lo es, es el título.
      taken.add('title');
      return { kind: 'title' } as const;
    }
    if (['dentro de', 'padre', 'parent'].includes(n) && !taken.has('parent')) {
      taken.add('parent');
      return { kind: 'parent' } as const;
    }
    if (['notas', 'notes'].includes(n) && !taken.has('notes')) {
      taken.add('notes');
      return { kind: 'notes' } as const;
    }
    const field = fields.find(
      f => !f.isTitle && f.type !== 'computed' && (normalizeName(f.label) === n || normalizeName(f.key) === n),
    );
    if (field && !taken.has(field.id)) {
      taken.add(field.id);
      return { kind: 'field', fieldId: field.id } as const;
    }
    if (title && normalizeName(title.label) === n && !taken.has('title')) {
      taken.add('title');
      return { kind: 'title' } as const;
    }
    return null;
  });
}

export interface CsvImportResult {
  project: Project;
  created: number;
  /** Valores que no se pudieron convertir al tipo de su atributo (se dejan vacíos). */
  skipped: number;
  /** «Dentro de» que no se encontró o que el tipo superior no admite. */
  unplaced: number;
}

const TEXT: FieldDefinition = { ...createField(), id: '__csv__', type: 'text' };

/** Crea un nodo por fila. Sin título, la fila se omite. */
export function importCsvRows(p: Project, typeId: string, table: CsvTable, mapping: ColumnTarget[]): CsvImportResult {
  const fields = allFields(p, typeId);
  const titleField = fields.find(f => f.isTitle);
  const titleColumn = mapping.findIndex(m => m?.kind === 'title');
  const parentColumn = mapping.findIndex(m => m?.kind === 'parent');
  const notesColumn = mapping.findIndex(m => m?.kind === 'notes');
  let skipped = 0;
  const created: { node: Node; parent: string }[] = [];
  for (const row of table.rows) {
    const title = titleColumn >= 0 ? (row[titleColumn] ?? '').trim() : '';
    if (titleColumn >= 0 && !title) continue;
    const values: Record<string, FieldValue> = { ...defaultValues(p, typeId) };
    if (titleField && title) values[titleField.id] = title;
    mapping.forEach((target, i) => {
      if (target?.kind !== 'field') return;
      const field = fields.find(f => f.id === target.fieldId);
      const text = (row[i] ?? '').trim();
      if (!field || !text) return;
      const value = convertValue(p, text, TEXT, field);
      if (value === null) skipped++;
      else values[field.id] = value;
    });
    created.push({
      node: {
        id: uid('node'),
        typeId,
        parentId: null,
        values,
        createdAt: now(),
        positions: {},
        notes: notesColumn >= 0 ? (row[notesColumn] ?? '') : '',
      },
      parent: parentColumn >= 0 ? (row[parentColumn] ?? '').trim() : '',
    });
  }
  let next: Project = { ...p, nodes: [...p.nodes, ...created.map(c => c.node)] };
  // «Dentro de» por título, entre todos (también los recién importados), si el tipo superior lo admite.
  let unplaced = 0;
  const byTitle = new Map<string, string>();
  for (const node of next.nodes) {
    const key = normalizeName(nodeLabel(next, node));
    if (!byTitle.has(key)) byTitle.set(key, node.id);
  }
  const parents = new Map<string, string>();
  for (const { node, parent } of created) {
    if (!parent) continue;
    const parentId = byTitle.get(normalizeName(parent));
    const parentNode = parentId ? next.nodes.find(n => n.id === parentId) : undefined;
    if (parentNode && parentId !== node.id && canContain(next, parentNode.typeId, typeId))
      parents.set(node.id, parentId!);
    else unplaced++;
  }
  if (parents.size) {
    next = { ...next, nodes: next.nodes.map(n => (parents.has(n.id) ? { ...n, parentId: parents.get(n.id)! } : n)) };
  }
  return { project: next, created: created.length, skipped, unplaced };
}
