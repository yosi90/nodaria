import { compatibleRelationTypes, nodeLabel } from '../../domain/selectors';
import type { Project } from '../../domain/types';
import type { Anchor } from '../common/anchor';
import { OptionList } from '../common/OptionList';
import { schemaOption } from '../common/options';
import { Popover } from '../common/Popover';

interface RelationTypeMenuProps {
  project: Project;
  sourceId: string;
  targetId: string;
  anchor: Anchor;
  onSelect: (schemaId: string) => void;
  onClose: () => void;
}

export function RelationTypeMenu({ project, sourceId, targetId, anchor, onSelect, onClose }: RelationTypeMenuProps) {
  const source = project.nodes.find(n => n.id === sourceId);
  const target = project.nodes.find(n => n.id === targetId);
  const title = source && target ? `${nodeLabel(project, source)} → ${nodeLabel(project, target)}` : 'Nueva relación';
  return (
    <Popover anchor={anchor} onClose={onClose} label="Elegir tipo de relación">
      <OptionList
        title={title}
        options={compatibleRelationTypes(project, sourceId, targetId).map(s => schemaOption(s))}
        selected={[]}
        onPick={onSelect}
        emptyLabel="Ningún tipo de relación admite estos dos nodos. Revisa «Desde» y «Hacia» en el tipo."
      />
    </Popover>
  );
}
