import {
  allFields,
  descendants,
  fieldValue,
  getNode,
  getSchema,
  nodeLabel,
  parentCandidates,
  typeMatches,
} from '../../domain/selectors';
import type { FieldDefinition, FieldValue, Relation, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';

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
    return <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />;
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

export function Inspector({
  selection,
  onClose,
  onRelation,
}: {
  selection: Selection;
  onClose: () => void;
  onRelation: (source: string) => void;
}) {
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

  const updateValue = (fieldId: string, value: FieldValue) => {
    const values = { ...item.values, [fieldId]: value };
    if (node) dispatch({ type: 'update-node', id: node.id, values, parentId: node.parentId });
    else dispatch({ type: 'update-relation', relation: { ...relation!, values } });
  };

  const remove = () => {
    const nested = node ? descendants(project, node.id).size - 1 : 0;
    const message = nested
      ? `¿Eliminar este nodo y sus ${nested} subnodos? Puedes deshacerlo con Ctrl+Z.`
      : '¿Eliminar este elemento? Puedes deshacerlo con Ctrl+Z.';
    if (!confirm(message)) return;
    dispatch(node ? { type: 'delete-node', id: node.id } : { type: 'delete-relation', id: relation!.id });
    onClose();
  };

  return (
    <aside className="inspector">
      <div className="panel-head">
        <h3>{node ? nodeLabel(project, node) : schema?.name}</h3>
        <div className="spacer" />
        <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          {node && (
            <label className="field">
              Padre
              <select
                value={node.parentId ?? ''}
                onChange={e =>
                  dispatch({ type: 'update-node', id: node.id, values: node.values, parentId: e.target.value || null })
                }
              >
                <option value="">Raíz</option>
                {parents.map(n => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(project, n)}
                  </option>
                ))}
              </select>
              <small>Solo aparecen nodos cuyo tipo admite este como subnodo.</small>
            </label>
          )}
          {relation && (
            <RelationEndpoints relation={relation} onChange={r => dispatch({ type: 'update-relation', relation: r })} />
          )}
          {fields.map(f => (
            <label className="field" key={f.id}>
              {f.label}
              {f.required && ' *'}
              <FieldControl field={f} value={fieldValue(f, item.values, fields)} onChange={v => updateValue(f.id, v)} />
              <small>{f.description}</small>
            </label>
          ))}
          {node && (
            <button className="btn" onClick={() => onRelation(node.id)}>
              ＋ Crear relación
            </button>
          )}
          <button className="btn danger" onClick={remove}>
            Eliminar
          </button>
        </div>
      </div>
    </aside>
  );
}

function RelationEndpoints({ relation, onChange }: { relation: Relation; onChange: (r: Relation) => void }) {
  const { project } = useApp();
  const s = getSchema(project, relation.typeId);
  return (
    <div className="field-row">
      <label className="field">
        Origen
        <select value={relation.sourceId} onChange={e => onChange({ ...relation, sourceId: e.target.value })}>
          {project.nodes
            .filter(n => n.id !== relation.targetId && typeMatches(project, n.typeId, s?.sourceTypeIds || []))
            .map(n => (
              <option key={n.id} value={n.id}>
                {nodeLabel(project, n)}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Destino
        <select value={relation.targetId} onChange={e => onChange({ ...relation, targetId: e.target.value })}>
          {project.nodes
            .filter(n => n.id !== relation.sourceId && typeMatches(project, n.typeId, s?.targetTypeIds || []))
            .map(n => (
              <option key={n.id} value={n.id}>
                {nodeLabel(project, n)}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
