import { GitFork, Plus, Trash2, X } from 'lucide-react';
import {
  allFields,
  creatableTypes,
  fieldValue,
  getNode,
  getSchema,
  nodeLabel,
  parentCandidates,
  typeMatches,
} from '../../domain/selectors';
import type { FieldDefinition, FieldValue, Relation, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { nodeOption } from '../common/options';
import { anchorOf, type Anchor } from '../common/anchor';
import { Select } from '../common/Select';

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
}) {
  const common = {
    value: String(value ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value),
  };
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
  onRelation: (source: string) => void;
  onAddChild: (parentId: string, anchor: Anchor) => void;
  onDelete: () => void;
}

export function Inspector({ selection, onClose, onRelation, onAddChild, onDelete }: InspectorProps) {
  const { project, dispatch } = useApp();
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

  const updateValue = (fieldId: string, value: FieldValue) => {
    const values = { ...item.values, [fieldId]: value };
    if (node) dispatch({ type: 'update-node', id: node.id, values, parentId: node.parentId });
    else dispatch({ type: 'update-relation', relation: { ...relation!, values } });
  };

  const title = node ? nodeLabel(project, node) : (schema?.name ?? 'Relación');
  const subtitle = node ? (schema?.name ?? 'Sin tipo') : relationSummary(relation!);

  return (
    <>
      <header className="inspector-head">
        <TypeIcon icon={schema?.icon} color={schema?.color} size="lg" />
        <div className="titles">
          <h2 title={title}>{title}</h2>
          <small>{subtitle}</small>
        </div>
        <IconButton icon={X} label="Cerrar inspector (Esc)" tooltipSide="left" onClick={onClose} />
      </header>
      <div className="panel-body">
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
                  onChange={parentId => dispatch({ type: 'update-node', id: node.id, values: node.values, parentId })}
                />
                <small>Solo aparecen nodos cuyo tipo admite este como subnodo.</small>
              </div>
            </div>
          </section>
        )}
        {relation && (
          <section className="inspector-section">
            <RelationEndpoints relation={relation} onChange={r => dispatch({ type: 'update-relation', relation: r })} />
          </section>
        )}
        {fields.length > 0 && (
          <section className="inspector-section">
            <div className="form-grid">
              {fields.map(f => {
                // Un checkbox ya lleva su propia etiqueta: no se puede anidar dentro de otro <label>.
                const Wrapper = f.type === 'boolean' ? 'div' : 'label';
                return (
                  <Wrapper className="field" key={f.id}>
                    <span>
                      {f.label}
                      {f.required && <span className="required"> *</span>}
                    </span>
                    <FieldControl
                      field={f}
                      value={fieldValue(f, item.values, fields)}
                      onChange={v => updateValue(f.id, v)}
                    />
                    {f.description && <small>{f.description}</small>}
                  </Wrapper>
                );
              })}
            </div>
          </section>
        )}
        <section className="inspector-section">
          <div className="inspector-actions">
            {node && canHaveChildren && (
              <Button icon={Plus} size="sm" onClick={event => onAddChild(node.id, anchorOf(event.currentTarget))}>
                Añadir subnodo
              </Button>
            )}
            {node && (
              <Button icon={GitFork} size="sm" onClick={() => onRelation(node.id)}>
                Crear relación
              </Button>
            )}
            <div className="spacer" />
            <Button icon={Trash2} size="sm" variant="danger" onClick={onDelete}>
              Eliminar
            </Button>
          </div>
        </section>
      </div>
    </>
  );

  function relationSummary(r: Relation) {
    const source = getNode(project, r.sourceId);
    const target = getNode(project, r.targetId);
    const arrow = schema?.directed ? '→' : '↔';
    return `${source ? nodeLabel(project, source) : '?'} ${arrow} ${target ? nodeLabel(project, target) : '?'}`;
  }
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
