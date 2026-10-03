import { useState, type DragEvent } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { slugify } from '../../domain/factories';
import type { FieldDefinition, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';

interface FieldEditorProps {
  schema: Schema;
  field: FieldDefinition;
  dragging: boolean;
  onChange: (field: FieldDefinition) => void;
  onDragStart: (fieldId: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, after: boolean) => void;
}

export function FieldEditor({ schema, field, dragging, onChange, onDragStart, onDragEnd, onDrop }: FieldEditorProps) {
  const { project, dispatch } = useApp();
  const [expanded, setExpanded] = useState(false);
  const set = <K extends keyof FieldDefinition>(key: K, value: FieldDefinition[K]) =>
    onChange({ ...field, [key]: value });
  const updateLabel = (label: string) => {
    const keyWasAutomatic = !field.key || field.key === slugify(field.label) || field.key === 'nuevo_campo';
    onChange({ ...field, label, key: keyWasAutomatic ? slugify(label) : field.key });
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onDrop(field.id, event.clientY > bounds.top + bounds.height / 2);
  };

  return (
    <div
      className={`field-def ${dragging ? 'dragging' : ''}`}
      onDragOver={event => event.preventDefault()}
      onDrop={drop}
    >
      <div className="field-def-head">
        <button
          type="button"
          className="drag-handle"
          draggable
          aria-label={`Reordenar ${field.label}`}
          title="Arrastrar para reordenar"
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            onDragStart(field.id);
          }}
          onDragEnd={onDragEnd}
        >
          ⠿
        </button>
        <button
          type="button"
          className="field-def-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          <span className="field-chevron">{expanded ? '▾' : '▸'}</span>
          <strong>{field.label || 'Atributo sin nombre'}</strong>
          <span className="pill">{FIELD_TYPES.find(item => item[0] === field.type)?.[1]}</span>
        </button>
        <button
          className="icon-btn"
          aria-label={`Eliminar ${field.label}`}
          onClick={() => dispatch({ type: 'delete-field', schemaId: schema.id, fieldId: field.id })}
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="field-def-content">
          <div className="field-row">
            <label className="field">
              Etiqueta
              <input value={field.label} onChange={event => updateLabel(event.target.value)} />
            </label>
            <label className="field">
              Clave interna
              <input value={field.key} onChange={event => set('key', slugify(event.target.value))} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              Tipo
              <select value={field.type} onChange={event => set('type', event.target.value as FieldDefinition['type'])}>
                {FIELD_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Valor inicial
              <input
                value={String(field.defaultValue ?? '')}
                onChange={event => set('defaultValue', event.target.value)}
              />
            </label>
          </div>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={field.required}
                onChange={event => set('required', event.target.checked)}
              />{' '}
              Obligatorio
            </label>
            <label>
              <input type="checkbox" checked={field.isTitle} onChange={event => set('isTitle', event.target.checked)} />{' '}
              Título del nodo
            </label>
          </div>
          <label className="field">
            Descripción
            <input value={field.description} onChange={event => set('description', event.target.value)} />
          </label>
          {field.type === 'select' && (
            <label className="field">
              Opciones
              <input
                value={field.options.join(', ')}
                onChange={event =>
                  set(
                    'options',
                    event.target.value
                      .split(',')
                      .map(value => value.trim())
                      .filter(Boolean),
                  )
                }
              />
            </label>
          )}
          {['nodeRef', 'nodeRefs'].includes(field.type) && (
            <label className="field">
              Tipos permitidos
              <select
                multiple
                value={field.referenceTypeIds}
                onChange={event =>
                  set(
                    'referenceTypeIds',
                    [...event.target.selectedOptions].map(option => option.value),
                  )
                }
              >
                {project.schemas
                  .filter(item => item.kind === 'entity')
                  .map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {field.type === 'computed' && (
            <label className="field">
              Fórmula
              <input
                value={field.formula}
                placeholder="{nombre} — {edad}"
                onChange={event => set('formula', event.target.value)}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
