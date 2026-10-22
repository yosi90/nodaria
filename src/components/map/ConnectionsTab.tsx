import { ArrowDownLeft, ArrowUpRight, AtSign, CalendarDays, Layers, Link2, Plus } from 'lucide-react';
import { createAgendaEntry, entriesOfNode, todayText } from '../../domain/agenda';
import { now, uid } from '../../domain/factories';
import { useProjectAccess } from '../../state/groups';
import { Button } from '../common/Button';
import { EntryChip } from '../calendar/agendaParts';
import type { ReactNode } from 'react';
import { nodeConnections } from '../../domain/connections';
import { getSchema, nodeLabel, relationRole } from '../../domain/selectors';
import type { Node, Project, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { TypeIcon } from '../common/icons';

/** Todo lo que conecta al nodo con otros, agrupado y navegable. */
export function ConnectionsTab({ nodeId }: { nodeId: string }) {
  const { project } = useApp();
  const { select } = useNavigation();
  const c = nodeConnections(project, nodeId);
  if (!c) return null;
  const go = (selection: Selection) => select(selection, { reveal: true });

  const byType = new Map<string, typeof c.relations>();
  c.relations.forEach(r => {
    const key = r.schema?.id ?? '?';
    byType.set(key, [...(byType.get(key) ?? []), r]);
  });

  const agenda = <NodeAgenda nodeId={nodeId} />;
  if (!c.total)
    return (
      <div className="connections">
        <p className="empty-copy">
          Este nodo aún no está conectado con nada. Crea una relación, rellena un atributo de referencia o menciónalo en
          las notas de otro nodo con [[su nombre]].
        </p>
        {agenda}
      </div>
    );

  return (
    <div className="connections">
      {(c.parent || c.children.length > 0) && (
        <Group icon={<Layers size={14} />} title="Dentro de">
          {c.parent && <NodeRow project={project} node={c.parent} hint="superior" onClick={go} />}
          {c.children.map(n => (
            <NodeRow key={n.id} project={project} node={n} hint="subnodo" onClick={go} />
          ))}
        </Group>
      )}
      {[...byType.entries()].map(([typeId, items]) => {
        const schema = getSchema(project, typeId);
        return (
          <Group
            key={typeId}
            icon={<TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />}
            title={schema?.name ?? 'Relación'}
          >
            {items.map(({ relation, other, direction }) => (
              <NodeRow
                key={relation.id}
                project={project}
                node={other}
                hint={(() => {
                  const role = relationRole(project, relation, direction === 'out' ? 'target' : 'source');
                  return role !== schema?.name ? role : undefined;
                })()}
                leading={
                  schema?.directed ? (
                    direction === 'out' ? (
                      <ArrowUpRight size={13} className="dir" aria-label="hacia" />
                    ) : (
                      <ArrowDownLeft size={13} className="dir" aria-label="desde" />
                    )
                  ) : undefined
                }
                onClick={go}
                onClickRelation={() => go({ kind: 'relation', id: relation.id })}
              />
            ))}
          </Group>
        );
      })}
      {c.referencesOut.length > 0 && (
        <Group icon={<Link2 size={14} />} title="Hace referencia a">
          {c.referencesOut.map(({ field, other }, i) => (
            <NodeRow
              key={`${field.field.id}-${other.id}-${i}`}
              project={project}
              node={other}
              hint={field.name}
              onClick={go}
            />
          ))}
        </Group>
      )}
      {c.referencesIn.length > 0 && (
        <Group icon={<Link2 size={14} />} title="Referenciado por">
          {c.referencesIn.map(({ field, other }, i) => (
            <NodeRow
              key={`${field.field.id}-${other.id}-${i}`}
              project={project}
              node={other}
              hint={`como ${field.name}`}
              onClick={go}
            />
          ))}
        </Group>
      )}
      {c.mentionsOut.length > 0 && (
        <Group icon={<AtSign size={14} />} title="Menciona en sus notas a">
          {c.mentionsOut.map(n => (
            <NodeRow key={n.id} project={project} node={n} onClick={go} />
          ))}
        </Group>
      )}
      {c.mentionsIn.length > 0 && (
        <Group icon={<AtSign size={14} />} title="Mencionado en las notas de">
          {c.mentionsIn.map(n => (
            <NodeRow key={n.id} project={project} node={n} onClick={go} />
          ))}
        </Group>
      )}
      {agenda}
    </div>
  );
}

/** Las entradas de la agenda que enlazan o mencionan el nodo, y crear una ya enlazada. */
function NodeAgenda({ nodeId }: { nodeId: string }) {
  const { project, dispatch } = useApp();
  const { openAgendaEntry } = useNavigation();
  const { canEdit } = useProjectAccess();
  const entries = entriesOfNode(project, nodeId);
  const today = todayText();
  return (
    <Group icon={<CalendarDays size={14} />} title="Agenda">
      <div className="node-agenda">
        {entries.map(e => (
          <EntryChip
            key={e.id}
            entry={e}
            today={today}
            canEdit={canEdit}
            showDate
            onOpen={openAgendaEntry}
            onToggle={id => dispatch({ type: 'toggle-agenda-entry', id })}
          />
        ))}
        {!entries.length && <p className="field-hint">Ninguna entrada de la agenda enlaza ni menciona este nodo.</p>}
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            onClick={() => {
              const id = uid('agenda');
              const entry = createAgendaEntry(id, { kind: 'task', date: todayText(), nodeIds: [nodeId] }, now());
              dispatch({ type: 'add-agenda-entry', entry });
              openAgendaEntry(id, true);
            }}
          >
            Nueva entrada en la agenda
          </Button>
        )}
      </div>
    </Group>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="connection-group">
      <h4>
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function NodeRow({
  project,
  node,
  hint,
  leading,
  onClick,
  onClickRelation,
}: {
  project: Project;
  node: Node;
  hint?: string;
  leading?: ReactNode;
  onClick: (selection: Selection) => void;
  onClickRelation?: () => void;
}) {
  const schema = getSchema(project, node.typeId);
  return (
    <div className="connection-row">
      <button type="button" className="connection-node" onClick={() => onClick({ kind: 'node', id: node.id })}>
        {leading}
        <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />
        <span className="label">{nodeLabel(project, node)}</span>
        <small>{schema?.name}</small>
      </button>
      {hint &&
        (onClickRelation ? (
          <button type="button" className="badge connection-hint" onClick={onClickRelation} title="Abrir la relación">
            {hint}
          </button>
        ) : (
          <span className="badge connection-hint">{hint}</span>
        ))}
    </div>
  );
}
