import { imageClasses, nodePortrait } from '../../domain/portrait';
import { getSchema } from '../../domain/selectors';
import type { Node, Project } from '../../domain/types';
import { TypeIcon } from './icons';

/** Retrato del nodo si tiene uno; si no, el icono de su tipo. Mismo tamaño en ambos casos. */
export function NodeAvatar({
  project,
  node,
  size = 'sm',
}: {
  project: Project;
  node: Pick<Node, 'typeId' | 'values'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const portrait = nodePortrait(project, node);
  if (portrait) return <img className={`avatar ${size} ${imageClasses(portrait)}`} src={portrait.src} alt="" />;
  const schema = getSchema(project, node.typeId);
  return <TypeIcon icon={schema?.icon} color={schema?.color} size={size} />;
}
