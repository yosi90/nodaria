import { ChevronLeft, ChevronRight, Pin, PinOff, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { nodeConnections } from '../../domain/connections';
import {
  allFields,
  creatableTypes,
  fieldText,
  fieldValue,
  getNode,
  getSchema,
  nodeLabel,
  parentCandidates,
  relationLabel,
  typeMatches,
} from '../../domain/selectors';
import type { FieldDefinition, FieldValue, Node, Project, Relation, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { nodeOption } from '../common/options';
import { Select } from '../common/Select';
import { ConnectionsTab } from './ConnectionsTab';
import { NotesTab } from './NotesTab';
import { ImageControl } from './ImageControl';
import { isImageValue } from './images';
import { ReferenceControl } from './ReferenceControl';
import { RelationsSection } from './RelationsSection';

type Tab = 'fields' | 'connections' | 'notes';

function FieldControl({
  field,
  value,
  ownerId,
  onChange,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  ownerId: string;
  onChange: (v: FieldValue) => void;
}) {
  const common = {
    value: String(value ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value),
  };
  if (field.type === 'nodeRef' || field.type === 'nodeRefs')
    return <ReferenceControl field={field} value={value} ownerId={ownerId} onChange={onChange} />;
  if (field.type === 'image') return <ImageControl value={value} label={field.label} onChange={onChange} />;
  if (field.type === 'boolean')
    return (
      <label className="check">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
        {value ? 'Sí' : 'No'}
      </label>
    );
  if (field.type === 'longText') return <textarea {...common} />;
  if (field.type === 'select')
    return (
      <select {...common}>
        <option value="">Sin elegir</option>
        {field.options.map(x => (
          <option key={x}>{x}</option>
        ))}
      </select>
    );
  if (field.type === 'computed') return <input disabled value={String(value ?? '')} />;
  return <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} {...common} />;
}

interface InspectorProps {
  selection: Selection;
  onClose: () => void;
  onAddChild: (parentId: string, anchor: Anchor) => void;
  onDelete: () => void;
}

export function Inspector({ selection, onClose, onAddChild, onDelete }: InspectorProps) {
  const { project, dispatch } = useApp();
  const { select, back, forward, canBack, canForward } = useNavigation();
  const [tab, setTab] = useState<Tab>('fields');
  const node = selection?.kind === 'node' ? getNode(project, selection.id) : undefined;
  const relation = selection?.kind === 'relation' ? project.relations.find(r => r.id === selection.id) : undefined;
  if (!node && !relation) return null;
  const item = node ?? relation!;
  const schema = getSchema(project, item.typeId);
  const fields = allFields(project, item.typeId);
  const parents = node ? parentCandidates(project, node.id) : [];
  const currentParent = node?.parentId ? getNode(project, node.parentId) : undefined;
  if (currentParent && !parents.includes(currentParent)) parents.unshift(currentParent);
  const canHaveChildren = node ? creatableTypes(project, node.id).length > 0 : false;
  const connections = node ? nodeConnections(project, node.id) : null;

  const updateValue = (fieldId: string, value: FieldValue) => {
    const values = { ...item.values, [fieldId]: value };
    if (node) dispatch({ type: 'update-node', id: node.id, values, parentId: node.parentId });
    else dispatch({ type: 'update-relation', relation: { ...relation!, values } });
  };

  const title = node ? nodeLabel(project, node) : relationLabel(project, relation!);
  const subtitle = node ? (schema?.name ?? 'Sin tipo') : relationSummary(relation!);
  const crumbs = node ? ancestors(project, node) : [];
  const portrait = fields
    .filter(f => f.type === 'image')
    .map(f => item.values[f.id])
    .find(isImageValue);

  return (
    <>
      <header className="inspector-head">
        <div className="nav-buttons">
          <IconButton icon={ChevronLeft} size="sm" label="Atrás" disabled={!canBack} onClick={back} />
          <IconButton icon={ChevronRight} size="sm" label="Adelante" disabled={!canForward} onClick={forward} />
        </div>
        {portrait ? (
          <img className="portrait" src={portrait} alt="" />
        ) : (
          <TypeIcon icon={schema?.icon} color={schema?.color} size="lg" />
        )}
        <div className="titles">
          {crumbs.length > 0 && (
            <nav className="crumbs" aria-label="Ruta">
              {crumbs.map(c => (
                <button key={c.id} type="button" onClick={() => select({ kind: 'node', id: c.id }, { reveal: true })}>
                  {nodeLabel(project, c)}
                </button>
              ))}
            </nav>
          )}
          <h2 title={title}>{title}</h2>
          <small>{subtitle}</small>
        </div>
        <IconButton icon={X} label="Cerrar inspector (Esc)" tooltipSide="left" onClick={onClose} />
      </header>
      {node && (
        <div className="segmented inspector-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'fields'} onClick={() => setTab('fields')}>
            Ficha
          </button>
          <button type="button" role="tab" aria-selected={tab === 'connections'} onClick={() => setTab('connections')}>
            Conexiones{connections?.total ? <span className="badge">{connections.total}</span> : null}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
            Notas{node.notes.trim() ? <span className="badge">●</span> : null}
          </button>
        </div>
      )}
      <div className="panel-body">
        {node && tab === 'connections' && <ConnectionsTab nodeId={node.id} />}
        {node && tab === 'notes' && <NotesTab node={node} />}
        {(!node || tab === 'fields') && (
          <>
            {node && (
              <section className="inspector-section">
                <div className="form-grid">
                  <div className="field">
                    Dentro de
                    <Select
                      aria-label="Nodo padre"
                      options={parents.map(n => nodeOption(project, n))}
                      value={node.parentId}
                      nullLabel="Raíz (sin padre)"
                      onChange={parentId =>
                        dispatch({ type: 'update-node', id: node.id, values: node.values, parentId })
                      }
                    />
                  </div>
                  <div className="field">
                    Posición en el lienzo
                    <div className="check-row">
                      {node.position ? (
                        <>
                          <span className="badge">
                            <Pin size={10} aria-hidden /> Fijada
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={PinOff}
                            onClick={() => dispatch({ type: 'move-nodes', positions: { [node.id]: null } })}
                          >
                            Volver a automática
                          </Button>
                        </>
                      ) : (
                        <span className="field-hint">Automática. Arrástralo en el lienzo para fijarla.</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
            {relation && (
              <section className="inspector-section">
                <RelationEndpoints
                  relation={relation}
                  onChange={r => dispatch({ type: 'update-relation', relation: r })}
                />
                {schema?.directed && (
                  <label className="field" style={{ marginTop: 'var(--space-3)' }}>
                    Visto desde el destino
                    <input
                      value={relation.reverseName}
                      placeholder={schema.inverseName || 'Igual que el nombre'}
                      onChange={e =>
                        dispatch({ type: 'update-relation', relation: { ...relation, reverseName: e.target.value } })
                      }
                    />
                    <small>«Tía» desde el origen y «Sobrina» desde el destino, por ejemplo.</small>
                  </label>
                )}
              </section>
            )}
            {fields.length > 0 && (
              <section className="inspector-section">
                <div className="form-grid">
                  {fields.map(f => {
                    // Un checkbox o un selector ya llevan su propia etiqueta: no se anidan dentro de otro <label>.
                    const Wrapper = ['boolean', 'nodeRef', 'nodeRefs', 'image'].includes(f.type) ? 'div' : 'label';
                    return (
                      <Wrapper className="field" key={f.id}>
                        <span>
                          {fieldText(f.label, schema?.name)}
                          {f.required && <span className="required"> *</span>}
                        </span>
                        <FieldControl
                          field={f}
                          value={fieldValue(f, item.values, fields)}
                          ownerId={item.id}
                          onChange={v => updateValue(f.id, v)}
                        />
                        {f.description && <small>{fieldText(f.description, schema?.name)}</small>}
                      </Wrapper>
                    );
                  })}
                </div>
              </section>
            )}
            {node && <RelationsSection nodeId={node.id} />}
            <section className="inspector-section">
              <div className="inspector-actions">
                {node && canHaveChildren && (
                  <Button icon={Plus} size="sm" onClick={event => onAddChild(node.id, anchorOf(event.currentTarget))}>
                    Añadir subnodo
                  </Button>
                )}
                <div className="spacer" />
                <Button icon={Trash2} size="sm" variant="danger" onClick={onDelete}>
                  Eliminar
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );

  function relationSummary(r: Relation) {
    const source = getNode(project, r.sourceId);
    const target = getNode(project, r.targetId);
    const arrow = schema?.directed ? '→' : '↔';
    const ends = `${source ? nodeLabel(project, source) : '?'} ${arrow} ${target ? nodeLabel(project, target) : '?'}`;
    return title === schema?.name ? ends : `${schema?.name ?? 'Relación'} · ${ends}`;
  }
}

/** Cadena de superiores en «Dentro de», del más lejano al padre directo. */
function ancestors(project: Project, node: Node): Node[] {
  const chain: Node[] = [];
  const seen = new Set<string>([node.id]);
  let cur = node.parentId ? getNode(project, node.parentId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? getNode(project, cur.parentId) : undefined;
  }
  return chain;
}

function RelationEndpoints({ relation, onChange }: { relation: Relation; onChange: (r: Relation) => void }) {
  const { project } = useApp();
  const s = getSchema(project, relation.typeId);
  const candidates = (key: 'sourceTypeIds' | 'targetTypeIds', exclude: string) =>
    project.nodes
      .filter(n => n.id !== exclude && typeMatches(project, n.typeId, s?.[key] ?? []))
      .map(n => nodeOption(project, n));
  return (
    <div className="form-grid">
      <div className="field">
        Origen
        <Select
          aria-label="Nodo de origen"
          options={candidates('sourceTypeIds', relation.targetId)}
          value={relation.sourceId}
          onChange={id => id && onChange({ ...relation, sourceId: id })}
        />
      </div>
      <div className="field">
        Destino
        <Select
          aria-label="Nodo de destino"
          options={candidates('targetTypeIds', relation.sourceId)}
          value={relation.targetId}
          onChange={id => id && onChange({ ...relation, targetId: id })}
        />
      </div>
    </div>
  );
}
