import { useState } from 'react';
import { RELATION_STYLES } from '../../domain/constants';
import { canChangeSchemaKind, inheritanceCandidates } from '../../domain/selectors';
import type { Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { DeleteSchemaModal } from './DeleteSchemaModal';
import { FieldEditor } from './FieldEditor';

export function SchemaEditor({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const kindLocked = !canChangeSchemaKind(project, schema.id);
  const update = (patch: Partial<Schema>) => dispatch({ type: 'update-schema', schema: { ...schema, ...patch } });
  const entities = project.schemas.filter(item => item.kind === 'entity');

  const reorderField = (targetId: string, after: boolean) => {
    if (!draggedFieldId || draggedFieldId === targetId) return;
    const fields = [...schema.fields];
    const dragged = fields.find(field => field.id === draggedFieldId);
    if (!dragged) return;
    const withoutDragged = fields.filter(field => field.id !== draggedFieldId);
    const targetIndex = withoutDragged.findIndex(field => field.id === targetId);
    withoutDragged.splice(targetIndex + (after ? 1 : 0), 0, dragged);
    update({ fields: withoutDragged });
    setDraggedFieldId(null);
  };

  return (
    <section className="schema-editor">
      <div className="schema-heading">
        <div>
          <h1>{schema.name}</h1>
          <p>Configura su identidad, herencia y estructura de datos.</p>
        </div>
        <button className="btn danger" onClick={() => setDeleting(true)}>
          Eliminar tipo
        </button>
      </div>
      <div className="editor-columns">
        <div className="card">
          <h3>Definición</h3>
          <div className="form-grid">
            <label className="field">
              Nombre
              <input value={schema.name} onChange={event => update({ name: event.target.value })} />
            </label>
            <div className="field-row">
              <label className="field">
                Clase
                <select
                  value={schema.kind}
                  disabled={kindLocked}
                  title={kindLocked ? 'No se puede cambiar: el tipo tiene instancias o subtipos.' : undefined}
                  onChange={event => update({ kind: event.target.value as Schema['kind'] })}
                >
                  <option value="entity">Entidad</option>
                  <option value="relationship">Relación</option>
                </select>
              </label>
              <label className="field">
                Color
                <input type="color" value={schema.color} onChange={event => update({ color: event.target.value })} />
              </label>
            </div>
            {schema.kind === 'entity' && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={schema.isAbstract}
                  onChange={event => update({ isAbstract: event.target.checked })}
                />{' '}
                Tipo abstracto
              </label>
            )}
            <label className="field">
              Hereda de
              <select
                value={schema.parentTypeId || ''}
                onChange={event => update({ parentTypeId: event.target.value || null })}
              >
                <option value="">Ninguno</option>
                {inheritanceCandidates(project, schema.id).map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Descripción
              <textarea value={schema.description} onChange={event => update({ description: event.target.value })} />
            </label>
            {schema.kind === 'entity' ? (
              <label className="field">
                Subnodos permitidos
                <select
                  multiple
                  value={schema.allowedChildTypeIds}
                  onChange={event =>
                    update({ allowedChildTypeIds: [...event.target.selectedOptions].map(option => option.value) })
                  }
                >
                  {entities
                    .filter(item => item.id !== schema.id && !item.isAbstract)
                    .map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <>
                <div className="field-row">
                  <label className="field">
                    Tipos de origen
                    <select
                      multiple
                      value={schema.sourceTypeIds}
                      onChange={event =>
                        update({ sourceTypeIds: [...event.target.selectedOptions].map(option => option.value) })
                      }
                    >
                      {entities.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Tipos de destino
                    <select
                      multiple
                      value={schema.targetTypeIds}
                      onChange={event =>
                        update({ targetTypeIds: [...event.target.selectedOptions].map(option => option.value) })
                      }
                    >
                      {entities.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={schema.directed}
                    onChange={event => update({ directed: event.target.checked })}
                  />{' '}
                  Relación dirigida
                </label>
                <label className="field">
                  Estilo
                  <select
                    value={schema.relationStyle}
                    onChange={event => update({ relationStyle: event.target.value as Schema['relationStyle'] })}
                  >
                    {Object.entries(RELATION_STYLES).map(([value, item]) => (
                      <option key={value} value={value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </div>
        <div className="card attributes-card">
          <div className="card-head">
            <h3>Atributos</h3>
            <button
              className="btn add-field-button"
              aria-label="Añadir atributo"
              title="Añadir atributo"
              onClick={() => dispatch({ type: 'add-field', schemaId: schema.id })}
            >
              ＋
            </button>
          </div>
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
              <p className="empty-copy">Este tipo aún no tiene atributos propios.</p>
            )}
          </div>
        </div>
      </div>
      {deleting && <DeleteSchemaModal schema={schema} onClose={() => setDeleting(false)} />}
    </section>
  );
}
