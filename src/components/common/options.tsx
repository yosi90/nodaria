import { getSchema, nodeLabel } from '../../domain/selectors';
import type { Node, Project, Schema } from '../../domain/types';
import { TypeIcon } from './icons';
import { NodeAvatar } from './NodeAvatar';
import type { Option } from './OptionList';

export function schemaOption(schema: Schema, hint?: string): Option {
  return {
    value: schema.id,
    label: schema.name,
    hint,
    leading: <TypeIcon icon={schema.icon} color={schema.color} size="sm" />,
  };
}

export function nodeOption(project: Project, node: Node): Option {
  const schema = getSchema(project, node.typeId);
  return {
    value: node.id,
    label: nodeLabel(project, node),
    hint: schema?.name,
    leading: <NodeAvatar project={project} node={node} size="sm" />,
  };
}
