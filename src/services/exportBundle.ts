import { formatDateValue } from '../domain/calendar';
import { GENDERS } from '../domain/constants';
import { allFields, fieldValue, getSchema, nodeLabel, relationRole } from '../domain/selectors';
import type { FieldDefinition, FieldValue, Node, Project } from '../domain/types';
import { serializeProject } from './storage';
import { createZip, dataUrlBytes, type ZipEntry } from './zip';

/*
 * Exportación completa (PENDIENTES.md, Fase 7): un ZIP con el proyecto en JSON, un CSV por tipo (y uno
 * de relaciones), una nota Markdown por nodo compatible con Obsidian (atributos en el encabezado YAML y
 * enlaces [[ ]] a los nodos relacionados) y las imágenes como archivos. Los CSV van separados por «;» y
 * con BOM, como los abre Excel en español.
 */

/** Nombre de archivo seguro y sin repetir (Obsidian enlaza por nombre de archivo). */
function fileNames(items: { id: string; title: string }[]) {
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const item of items) {
    const base =
      item.title
        .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Sin título';
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})`;
    taken.add(name.toLowerCase());
    names.set(item.id, name);
  }
  return names;
}

const csvCell = (text: string) => (/[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const csvRow = (cells: string[]) => cells.map(csvCell).join(';');
const yamlValue = (text: string) =>
  text === '' || /[:#\-[\]{}"'\n,&*!|>%@`]|^\s|\s$/.test(text) ? JSON.stringify(text) : text;

export function exportBundle(p: Project): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const titles = new Map(p.nodes.map(n => [n.id, nodeLabel(p, n)]));
  const names = fileNames(p.nodes.map(n => ({ id: n.id, title: titles.get(n.id)! })));
  const images = new Map<string, string>(); // `${nodo}|${atributo}` → ruta en el ZIP

  // Imágenes primero, para que los CSV y las notas puedan citarlas.
  const imageNames = new Set<string>();
  for (const node of p.nodes) {
    for (const field of allFields(p, node.typeId)) {
      const value = node.values[field.id];
      if (field.type !== 'image' || typeof value !== 'string') continue;
      const decoded = dataUrlBytes(value);
      if (!decoded) continue;
      let path = `imagenes/${names.get(node.id)} - ${field.label.replace(/[\\/:*?"<>|]+/g, ' ')}.${decoded.extension}`;
      for (let i = 2; imageNames.has(path); i++) path = path.replace(/(\.\w+)$/, ` (${i})$1`);
      imageNames.add(path);
      images.set(`${node.id}|${field.id}`, path);
      entries.push({ name: path, data: decoded.bytes });
    }
  }
  const map = p.mapImage ? dataUrlBytes(p.mapImage.data) : null;
  if (map) entries.push({ name: `imagenes/mapa.${map.extension}`, data: map.bytes });

  const text = (node: Node, field: FieldDefinition, fields: FieldDefinition[], link: boolean): string => {
    const value: FieldValue | undefined = fieldValue(field, node.values, fields, { project: p, node });
    if (value === undefined || value === null || value === '') return '';
    const title = (id: string) => (link ? `[[${names.get(id) ?? id}]]` : (titles.get(id) ?? ''));
    switch (field.type) {
      case 'nodeRef':
        return typeof value === 'string' ? title(value) : '';
      case 'nodeRefs':
        return Array.isArray(value) ? value.map(title).join(', ') : '';
      case 'boolean':
        return value ? 'Sí' : 'No';
      case 'date':
        return formatDateValue(p.calendar, value);
      case 'gender':
        return GENDERS.find(([id]) => id === value)?.[1] ?? String(value);
      case 'image':
        return images.get(`${node.id}|${field.id}`) ?? '';
      default:
        return Array.isArray(value) ? value.join(', ') : String(value);
    }
  };

  // Un CSV por tipo de entidad con nodos de ese tipo exacto.
  const csvNames = fileNames(p.schemas.map(s => ({ id: s.id, title: s.name })));
  for (const schema of p.schemas.filter(s => s.kind === 'entity')) {
    const nodes = p.nodes.filter(n => n.typeId === schema.id);
    if (!nodes.length) continue;
    const fields = allFields(p, schema.id).filter(f => !f.isTitle);
    const rows = [
      csvRow(['Título', 'Dentro de', ...fields.map(f => f.label), 'Notas']),
      ...nodes.map(node =>
        csvRow([
          titles.get(node.id)!,
          node.parentId ? (titles.get(node.parentId) ?? '') : '',
          ...fields.map(f => text(node, f, allFields(p, schema.id), false)),
          node.notes,
        ]),
      ),
    ];
    entries.push({ name: `csv/${csvNames.get(schema.id)}.csv`, data: `﻿${rows.join('\r\n')}\r\n` });
  }
  if (p.relations.length) {
    const rows = [
      csvRow(['Tipo', 'Origen', 'Papel del origen', 'Destino', 'Papel del destino']),
      ...p.relations.map(r =>
        csvRow([
          getSchema(p, r.typeId)?.name ?? '',
          titles.get(r.sourceId) ?? '',
          relationRole(p, r, 'source'),
          titles.get(r.targetId) ?? '',
          relationRole(p, r, 'target'),
        ]),
      ),
    ];
    entries.push({ name: 'csv/relaciones.csv', data: `﻿${rows.join('\r\n')}\r\n` });
  }

  // Una nota por nodo, como en Obsidian: atributos en el encabezado y enlaces [[ ]].
  for (const node of p.nodes) {
    const schema = getSchema(p, node.typeId);
    const fields = allFields(p, node.typeId);
    const front = [`tipo: ${yamlValue(schema?.name ?? '')}`];
    if (node.parentId) front.push(`dentro_de: ${yamlValue(`[[${names.get(node.parentId)}]]`)}`);
    for (const field of fields.filter(f => !f.isTitle)) {
      const value = text(node, field, fields, true);
      if (value) front.push(`${yamlValue(field.label)}: ${yamlValue(value)}`);
    }
    const lines = ['---', ...front, '---', '', `# ${titles.get(node.id)}`, ''];
    if (node.notes.trim()) lines.push(node.notes.trim(), '');
    const related = p.relations.filter(r => r.sourceId === node.id || r.targetId === node.id);
    if (related.length) {
      lines.push('## Relaciones', '');
      for (const r of related) {
        const other = r.sourceId === node.id ? r.targetId : r.sourceId;
        const role = relationRole(p, r, r.sourceId === node.id ? 'source' : 'target');
        lines.push(`- ${role}: [[${names.get(other)}]]`);
      }
      lines.push('');
    }
    const children = p.nodes.filter(n => n.parentId === node.id);
    if (children.length) lines.push('## Dentro', '', ...children.map(c => `- [[${names.get(c.id)}]]`), '');
    entries.push({ name: `notas/${names.get(node.id)}.md`, data: lines.join('\n') });
  }

  entries.unshift({
    name: `${p.name.replace(/[\\/:*?"<>|]+/g, '_') || 'proyecto'}.nodaria.json`,
    data: serializeProject(p),
  });
  return entries;
}

/** El ZIP de la exportación completa. */
export const exportZip = (p: Project, date = new Date()) => createZip(exportBundle(p), date);
