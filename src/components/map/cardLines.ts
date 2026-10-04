import { evaluateFormula } from '../../domain/formulas';
import { isImageData, type NodeImage } from '../../domain/portrait';
import { allFields } from '../../domain/selectors';
import type { FieldDefinition, Node, Project } from '../../domain/types';
import { NODE_H } from './layout';

/** Lo que un atributo aporta a la tarjeta: una insignia (solo icono) o una línea (icono y texto). */
export interface CardBadge {
  icon: string;
  title: string;
  /** Miniatura de un atributo de imagen (en vez del icono). */
  image?: NodeImage;
}
export interface CardLine {
  icon: string | null;
  text: string;
  image?: NodeImage;
}

const LINE_H = 17;
const LINES_PAD = 7;

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length);

function describe(p: Project, f: FieldDefinition, v: unknown): string {
  if (f.type === 'boolean') return f.label;
  if (f.type === 'nodeRef' || f.type === 'nodeRefs') {
    const ids = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
    const names = ids
      .map(id => p.nodes.find(n => n.id === id))
      .filter((n): n is Node => Boolean(n))
      .map(n => {
        const fields = allFields(p, n.typeId);
        const title = fields.find(x => x.isTitle) ?? fields.find(x => x.type === 'text');
        return String((title && n.values[title.id]) || n.id);
      });
    return `${f.label}: ${names.join(', ')}`;
  }
  if (f.type === 'image') return f.label;
  if (f.type === 'tags') return `${f.label}: ${Array.isArray(v) ? v.join(', ') : String(v)}`;
  if (f.type === 'scale') return `${f.label}: ${'★'.repeat(Number(v))}${'☆'.repeat(Math.max(0, 5 - Number(v)))}`;
  return `${f.label}: ${String(v)}`;
}

/** Insignias y líneas de un nodo según el «Mostrar en el nodo» de sus atributos (y de la opción elegida). */
export function cardContent(p: Project, n: Node): { badges: CardBadge[]; lines: CardLine[] } {
  const badges: CardBadge[] = [];
  const lines: CardLine[] = [];
  allFields(p, n.typeId).forEach(f => {
    const v = f.type === 'computed' ? evaluateFormula(p, n, f.formula) : n.values[f.id];
    if (isEmpty(v)) return;
    const option = f.type === 'select' ? String(v) : null;
    const mode = (option && f.optionDisplay[option]) || f.nodeDisplay;
    if (mode === 'none') return;
    const icon = (option ? f.optionIcons[option] : undefined) ?? f.icon;
    // Un atributo de imagen se enseña como miniatura (el retrato ya va en su sitio).
    const image: NodeImage | undefined =
      f.type === 'image' && isImageData(v) && !f.portrait
        ? { field: f, src: v, shape: f.imageShape, border: f.imageBorder }
        : undefined;
    if (f.type === 'image' && !image) return;
    if (mode === 'icon') {
      if (image) badges.push({ icon: icon ?? 'image', title: f.label, image });
      else if (icon) badges.push({ icon, title: describe(p, f, v) });
      return;
    }
    lines.push({ icon, text: f.type === 'image' ? f.label : describe(p, f, v), image });
  });
  return { badges: badges.slice(0, 4), lines };
}

/** Altura de la tarjeta: la base más una línea por atributo mostrado con texto. */
export const cardHeight = (lines: number) => NODE_H + (lines ? LINES_PAD + lines * LINE_H : 0);
