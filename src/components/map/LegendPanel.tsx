import { X } from 'lucide-react';
import { referenceFields, referenceLinks } from '../../domain/references';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';

/** Leyenda de tipos con casillas para mostrar u ocultar cada uno en el lienzo. */
export function LegendPanel({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { view } = project;
  const entities = project.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  const relations = project.schemas.filter(s => s.kind === 'relationship');
  const nodeCount = (id: string) => project.nodes.filter(n => n.typeId === id).length;
  const relationCount = (id: string) => project.relations.filter(r => r.typeId === id).length;
  const hierarchyCount = project.nodes.filter(n => n.parentId).length;
  const refs = referenceFields(project);
  const refCounts = new Map<string, number>();
  referenceLinks(project).forEach(l => refCounts.set(l.fieldId, (refCounts.get(l.fieldId) ?? 0) + 1));

  const toggle = (key: 'hiddenEntityTypeIds' | 'hiddenRelationTypeIds' | 'hiddenReferenceFieldIds', id: string) => {
    const list = view[key];
    dispatch({
      type: 'update-view',
      view: { [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] },
    });
  };

  return (
    <section className="legend-panel" aria-label="Leyenda y filtros">
      <header>
        <h3>Leyenda</h3>
        <IconButton icon={X} size="sm" label="Cerrar leyenda" tooltip={false} onClick={onClose} />
      </header>
      <div className="legend-group">
        <div className="legend-title">Entidades</div>
        {entities.map(s => (
          <label key={s.id} className="legend-row">
            <input
              type="checkbox"
              checked={!view.hiddenEntityTypeIds.includes(s.id)}
              onChange={() => toggle('hiddenEntityTypeIds', s.id)}
            />
            <TypeIcon icon={s.icon} color={s.color} size="sm" />
            <span className="label">{s.name}</span>
            <span className="count">{nodeCount(s.id)}</span>
          </label>
        ))}
        {!entities.length && <p className="muted-note">Sin tipos de entidad.</p>}
      </div>
      <div className="legend-group">
        <div className="legend-title">Relaciones</div>
        <label className="legend-row">
          <input
            type="checkbox"
            checked={view.showHierarchy}
            onChange={() => dispatch({ type: 'update-view', view: { showHierarchy: !view.showHierarchy } })}
          />
          <span className="legend-line hierarchy" aria-hidden />
          <span className="label">Dentro de</span>
          <span className="count">{hierarchyCount}</span>
        </label>
        {relations.map(s => (
          <label key={s.id} className="legend-row">
            <input
              type="checkbox"
              checked={!view.hiddenRelationTypeIds.includes(s.id)}
              onChange={() => toggle('hiddenRelationTypeIds', s.id)}
            />
            <span
              className={`legend-line ${s.relationStyle}`}
              style={{ background: s.color, borderColor: s.color }}
              aria-hidden
            />
            <span className="label">{s.name}</span>
            <span className="count">{relationCount(s.id)}</span>
          </label>
        ))}
      </div>
      {refs.length > 0 && (
        <div className="legend-group">
          <div className="legend-title">Referencias</div>
          {refs.map(r => (
            <label key={r.field.id} className="legend-row">
              <input
                type="checkbox"
                checked={!view.hiddenReferenceFieldIds.includes(r.field.id)}
                onChange={() => toggle('hiddenReferenceFieldIds', r.field.id)}
              />
              <span className="legend-line reference" aria-hidden />
              <span className="label">{r.name}</span>
              <span className="count">{refCounts.get(r.field.id) ?? 0}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
