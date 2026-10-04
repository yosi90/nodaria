import { allFields } from './selectors';
import type { FieldDefinition, Node, Project } from './types';

/*
 * Imágenes de los nodos. Un atributo de tipo imagen guarda una data URL reducida; cada atributo
 * decide su forma, si lleva borde y si sirve de retrato del nodo (sustituye al icono del tipo en
 * tarjetas, árbol, listas y ficha). Si varios atributos son retrato, manda el primero con valor.
 */

export type ImageShape = 'circle' | 'rounded' | 'square';

export const IMAGE_SHAPES: ReadonlyArray<[ImageShape, string]> = [
  ['rounded', 'Cuadrada redondeada'],
  ['circle', 'Circular'],
  ['square', 'Cuadrada'],
];

export interface NodeImage {
  field: FieldDefinition;
  src: string;
  shape: ImageShape;
  border: boolean;
}

export const isImageData = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

/** Atributos de imagen con valor de un nodo, en el orden de sus atributos. */
export function nodeImages(p: Project, node: Pick<Node, 'typeId' | 'values'>): NodeImage[] {
  return allFields(p, node.typeId)
    .filter(f => f.type === 'image')
    .flatMap(field => {
      const src = node.values[field.id];
      return isImageData(src) ? [{ field, src, shape: field.imageShape, border: field.imageBorder }] : [];
    });
}

/** Retrato del nodo: la primera imagen marcada como retrato, o ninguna. */
export function nodePortrait(p: Project, node: Pick<Node, 'typeId' | 'values'>): NodeImage | null {
  return nodeImages(p, node).find(image => image.field.portrait) ?? null;
}

/** Clases CSS de forma y borde para cualquier `<img>` de atributo. */
export const imageClasses = (image: Pick<NodeImage, 'shape' | 'border'>) =>
  `shape-${image.shape}${image.border ? '' : ' no-border'}`;
