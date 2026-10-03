import { nodeLabel } from './selectors';
import type { Node, Project } from './types';

/*
 * Notas en texto con menciones `[[Nombre]]`. Las menciones se resuelven por el título de los
 * nodos (sin distinguir mayúsculas ni acentos) y cuentan como conexiones.
 */

const MENTION = /\[\[([^\]\n]+)\]\]/g;

export const normalizeName = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Nombres mencionados en un texto, sin repetir, en orden de aparición. */
export function extractMentions(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    const name = match[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Índice título normalizado → nodo. Ante títulos repetidos gana el primero creado. */
export function mentionIndex(p: Project): Map<string, Node> {
  const index = new Map<string, Node>();
  p.nodes.forEach(n => {
    const key = normalizeName(nodeLabel(p, n));
    if (key && !index.has(key)) index.set(key, n);
  });
  return index;
}

/** Nodos mencionados en las notas de `node`. */
export function mentionedNodes(p: Project, node: Node, index = mentionIndex(p)): Node[] {
  return extractMentions(node.notes)
    .map(name => index.get(normalizeName(name)))
    .filter((n): n is Node => Boolean(n) && n!.id !== node.id);
}

/** Nodos cuyas notas mencionan a `node`. */
export function mentioningNodes(p: Project, node: Node): Node[] {
  const index = mentionIndex(p);
  return p.nodes.filter(n => n.id !== node.id && n.notes && mentionedNodes(p, n, index).some(m => m.id === node.id));
}

export type NoteSegment = { kind: 'text'; text: string } | { kind: 'mention'; name: string; node: Node | null };

/** Divide un texto en tramos normales y menciones (resueltas o no), para pintarlo con enlaces. */
export function segmentNotes(p: Project, text: string, index = mentionIndex(p)): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: 'text', text: text.slice(last, start) });
    const name = match[1].trim();
    segments.push({ kind: 'mention', name, node: index.get(normalizeName(name)) ?? null });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}
