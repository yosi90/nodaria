import { Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { RELATION_STYLES } from '../../domain/constants';
import { canChangeSchemaKind, inheritanceCandidates, inheritedSchemas, schemaUsage } from '../../domain/selectors';
import type { Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { schemaOption } from '../common/options';
import { MultiSelect, Select } from '../common/Select';
import { AppearancePicker } from './AppearancePicker';
import { DeleteSchemaModal } from './DeleteSchemaModal';
import { FieldEditor } from './FieldEditor';

export function SchemaEditor({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const kindLocked = !canChangeSchemaKind(project, schema.id);
  const update = (patch: Partial<Schema>) => dispatch({ type: 'update-schema', schema: { ...schema, ...patch } });
  const entities = project.schemas.filter(item => item.kind === 'entity');
  const usage = schemaUsage(project, schema.id);
  const ancestors = inheritedSchemas(project, schema.id).slice(0, -1);
  const isEntity = schema.kind === 'entity';

  const reorderField = (targetId: string, after: boolean) => {
    if (!draggedFieldId || draggedFieldId === targetId) return;
    const dragged = schema.fields.find(field => field.id === draggedFieldId);
    if (!dragged) return;
    const withoutDragged = schema.fields.filter(field => field.id !== draggedFieldId);
    const targetIndex = withoutDragged.findIndex(field => field.id === targetId);
    withoutDragged.splice(targetIndex + (after ? 1 : 0), 0, dragged);
    update({ fields: withoutDragged });
    setDraggedFieldId(null);
  };

  return (
    <section className="schema-editor">
      <div className="schema-heading">
        <TypeIcon icon={schema.icon} color={schema.color} size="lg" />
        <div className="titles">
          <h1>{schema.name || 'Tipo sin nombre'}</h1>
          <p>
            {isEntity ? (schema.isAbstract ? 'Entidad abstracta' : 'Entidad') : 'Relación'} ·{' '}
            {isEntity
              ? `${usage.nodes} ${usage.nodes === 1 ? 'nodo' : 'nodos'}`
              : `${usage.relations} ${usage.relations === 1 ? 'relación' : 'relaciones'}`}
            {usage.subtypes > 0 && ` · ${usage.subtypes} ${usage.subtypes === 1 ? 'subtipo' : 'subtipos'}`}
          </p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
          Eliminar tipo
        </Button>
      </div>
      <div className="editor-columns">
        <div className="form-grid">
          <div className="card">
            <div className="card-head">
              <h3>Identidad</h3>
            </div>
            <div className="form-grid">
              <label className="field">
                Nombre
                <input value={schema.name} onChange={event => update({ name: event.target.value })} />
              </label>
              <div className="field">
                Apariencia
                <AppearancePicker icon={schema.icon} color={schema.color} onChange={patch => update(patch)} />
              </div>
              <div className="field">
                Clase
                <div className="segmented" role="group" aria-label="Clase de tipo">
                  {(['entity', 'relationship'] as const).map(kind => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={schema.kind === kind}
                      disabled={kindLocked && schema.kind !== kind}
                      onClick={() => update({ kind })}
                    >
                      {kindLocked && schema.kind !== kind && <Lock size={12} aria-hidden />}
                      {kind === 'entity' ? 'Entidad' : 'Relación'}
                    </button>
                  ))}
                </div>
                {kindLocked && <small>No se puede cambiar mientras tenga instancias o subtipos.</small>}
              </div>
              <div className="field">
                Hereda de
                <Select
                  aria-label="Tipo padre"
                  options={inheritanceCandidates(project, schema.id).map(item => schemaOption(item))}
                  value={schema.parentTypeId}
                  nullLabel="Ninguno"
                  onChange={parentTypeId => update({ parentTypeId })}
                />
                <small>Hereda sus atributos y cuenta como ese tipo en las restricciones.</small>
              </div>
              {isEntity && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={schema.isAbstract}
                    onChange={event => update({ isAbstract: event.target.checked })}
                  />
                  Tipo abstracto <span className="field-hint">(solo sirve de base para otros tipos)</span>
                </label>
              )}
              <label className="field">
                Descripción
                <textarea
                  value={schema.description}
                  placeholder="Para qué sirve este tipo…"
                  onChange={event => update({ description: event.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>{isEntity ? 'Jerarquía' : 'Conexión'}</h3>
            </div>
            {isEntity ? (
              <div className="field">
                Subnodos permitidos
                <MultiSelect
                  options={entities.filter(item => !item.isAbstract).map(item => schemaOption(item))}
                  value={schema.allowedChildTypeIds}
                  onChange={allowedChildTypeIds => update({ allowedChildTypeIds })}
                  addLabel="Añadir tipo"
                  emptyText="Ninguno: sus nodos no pueden contener otros."
                />
                <small>Los subtipos de un tipo permitido también se admiten.</small>
              </div>
            ) : (
              <div className="form-grid">
                <div className="field">
                  Desde
                  <MultiSelect
                    options={entities.map(item => schemaOption(item))}
                    value={schema.sourceTypeIds}
                    onChange={sourceTypeIds => update({ sourceTypeIds })}
                    addLabel="Añadir tipo"
                    emptyText="Cualquier tipo."
                  />
                </div>
                <div className="field">
                  Hacia
                  <MultiSelect
                    options={entities.map(item => schemaOption(item))}
                    value={schema.targetTypeIds}
                    onChange={targetTypeIds => update({ targetTypeIds })}
                    addLabel="Añadir tipo"
                    emptyText="Cualquier tipo."
                  />
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={schema.directed}
                    onChange={event => update({ directed: event.target.checked })}
                  />
                  Relación dirigida <span className="field-hint">(con flecha, de origen a destino)</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={schema.structural}
                    onChange={event => update({ structural: event.target.checked })}
                  />
                  Forma estructura <span className="field-hint">(se puede ver como árbol en «Ver por»)</span>
                </label>
                {schema.structural && (
                  <div className="field">
                    El superior es
                    <div className="segmented" role="group" aria-label="Extremo superior">
                      <button
                        type="button"
                        aria-pressed={schema.parentEnd === 'source'}
                        onClick={() => update({ parentEnd: 'source' })}
                      >
                        El origen
                      </button>
                      <button
                        type="button"
                        aria-pressed={schema.parentEnd === 'target'}
                        onClick={() => update({ parentEnd: 'target' })}
                      >
                        El destino
                      </button>
                    </div>
                    <small>
                      {schema.parentEnd === 'target'
                        ? `En «A ${schema.name || '…'} B», A cuelga de B. Ejemplo: «vive en», «hijo de».`
                        : `En «A ${schema.name || '…'} B», B cuelga de A. Ejemplo: «contiene», «gobierna».`}
                    </small>
                  </div>
                )}
                <div className="field">
                  Estilo de línea
                  <div className="segmented" role="group" aria-label="Estilo de línea">
                    {Object.entries(RELATION_STYLES).map(([value, item]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={schema.relationStyle === value}
                        onClick={() => update({ relationStyle: value as Schema['relationStyle'] })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Atributos</h3>
            <IconButton
              icon={Plus}
              variant="outlined"
              label="Añadir atributo"
              tooltipSide="left"
              onClick={() => dispatch({ type: 'add-field', schemaId: schema.id })}
            />
          </div>
          {ancestors.length > 0 && (
            <p className="muted-note" style={{ marginBottom: 'var(--space-3)' }}>
              Hereda{' '}
              {ancestors.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  {a.fields.length} de «{a.name}»{a.fields.length > 0 && ` (${a.fields.map(f => f.label).join(', ')})`}
                </span>
              ))}
              .
            </p>
          )}
          <div className="field-list">
            {schema.fields.length ? (
              schema.fields.map(field => (
                <FieldEditor
                  key={field.id}
                  schema={schema}
                  field={field}
                  dragging={draggedFieldId === field.id}
                  onDragStart={setDraggedFieldId}
                  onDragEnd={() => setDraggedFieldId(null)}
                  onDrop={reorderField}
                  onChange={changed =>
                    update({ fields: schema.fields.map(item => (item.id === changed.id ? changed : item)) })
                  }
                />
              ))
            ) : (
              <p className="empty-copy">
                Aún no tiene atributos propios. Añade, por ejemplo, un «Nombre» y márcalo como título del nodo.
              </p>
            )}
          </div>
        </div>
      </div>
      {deleting && <DeleteSchemaModal schema={schema} onClose={() => setDeleting(false)} />}
    </section>
  );
}
