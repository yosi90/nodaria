import { ChevronDown, ChevronRight, GripVertical, Trash2, X } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { slugify } from '../../domain/factories';
import type { FieldDefinition } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';
import { schemaOption } from '../common/options';
import { MultiSelect } from '../common/Select';

interface FieldEditorProps {
  field: FieldDefinition;
  dragging: boolean;
  onChange: (field: FieldDefinition) => void;
  onDelete: () => void;
  onDragStart: (fieldId: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, after: boolean) => void;
  /** Insignias y acciones extra en la cabecera (p. ej. «Compartido», «Usado en 3 tipos»). */
  badges?: ReactNode;
  actions?: ReactNode;
  /** Mostrar «Título del nodo»: no aplica a los atributos de relación. */
  allowTitle?: boolean;
}

/** Edición de un atributo, propio de un tipo o de la biblioteca compartida. */
export function FieldEditor({
  field,
  dragging,
  onChange,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
  badges,
  actions,
  allowTitle = true,
}: FieldEditorProps) {
  const { project } = useApp();
  const [expanded, setExpanded] = useState(field.key === 'nuevo_campo' || field.key.startsWith('nuevo_campo_'));
  const set = <K extends keyof FieldDefinition>(key: K, value: FieldDefinition[K]) =>
    onChange({ ...field, [key]: value });
  const updateLabel = (label: string) => {
    const keyWasAutomatic = !field.key || field.key === slugify(field.label) || field.key.startsWith('nuevo_campo');
    onChange({ ...field, label, key: keyWasAutomatic ? slugify(label) : field.key });
  };
  const typeLabel = FIELD_TYPES.find(item => item[0] === field.type)?.[1];
  const hasDefault = !['computed', 'nodeRef', 'nodeRefs', 'image'].includes(field.type);

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
          <GripVertical size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="field-def-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          <span className="field-chevron">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
          <strong>{field.label || 'Atributo sin nombre'}</strong>
          {badges}
          {field.isTitle && <span className="badge accent">Título</span>}
          {field.required && <span className="badge warning">Obligatorio</span>}
          <span className="badge">{typeLabel}</span>
        </button>
        {actions}
        <IconButton
          icon={Trash2}
          size="sm"
          variant="danger"
          label={`Eliminar ${field.label}`}
          tooltipSide="left"
          onClick={onDelete}
        />
      </div>
      {expanded && (
        <div className="field-def-content">
          <div className="field-row">
            <label className="field">
              Etiqueta
              <input
                value={field.label}
                autoFocus={field.label === 'Nuevo campo'}
                onChange={e => updateLabel(e.target.value)}
              />
            </label>
            <label className="field">
              Clave interna
              <input value={field.key} onChange={event => set('key', slugify(event.target.value))} />
              <small>Se usa en las fórmulas como {`{${field.key || 'clave'}}`}.</small>
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
            {hasDefault && (
              <label className="field">
                Valor inicial
                <input
                  value={String(field.defaultValue ?? '')}
                  placeholder={field.type === 'boolean' ? 'sí / no' : ''}
                  onChange={event => set('defaultValue', event.target.value)}
                />
              </label>
            )}
          </div>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={field.required}
                onChange={event => set('required', event.target.checked)}
              />
              Obligatorio
            </label>
            {allowTitle && (
              <label>
                <input
                  type="checkbox"
                  checked={field.isTitle}
                  onChange={event => set('isTitle', event.target.checked)}
                />
                Título del nodo
              </label>
            )}
          </div>
          <label className="field">
            Descripción
            <input
              value={field.description}
              placeholder="Ayuda que se muestra bajo el campo"
              onChange={event => set('description', event.target.value)}
            />
            <small>
              Puedes escribir {'{tipo}'} en la etiqueta o la descripción: «Nombre del {'{tipo}'}» se lee «Nombre del
              Personaje» en un personaje y «Nombre del Lugar» en un lugar.
            </small>
          </label>
          {field.type === 'image' && (
            <p className="field-hint">
              La imagen se reduce al guardarla (máximo 384 px) y se muestra en la tarjeta del nodo en lugar del icono.
            </p>
          )}
          {field.type === 'select' && (
            <div className="field">
              Opciones
              <OptionsEditor options={field.options} onChange={options => set('options', options)} />
            </div>
          )}
          {(field.type === 'nodeRef' || field.type === 'nodeRefs') && (
            <div className="field">
              Tipos permitidos
              <MultiSelect
                options={project.schemas.filter(item => item.kind === 'entity').map(item => schemaOption(item))}
                value={field.referenceTypeIds}
                onChange={ids => set('referenceTypeIds', ids)}
                addLabel="Añadir tipo"
                emptyText="Cualquier tipo."
              />
            </div>
          )}
          {field.type === 'computed' && (
            <label className="field">
              Fórmula
              <input
                value={field.formula}
                placeholder="{nombre} — {edad}"
                onChange={event => set('formula', event.target.value)}
              />
              <small>Escribe las claves de otros atributos entre llaves.</small>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Opciones de una lista: chips que se añaden con Intro o coma y se quitan con su botón. */
function OptionsEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const value = draft.trim();
    if (value && !options.includes(value)) onChange([...options, value]);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && options.length) onChange(options.slice(0, -1));
  };
  return (
    <div className="form-grid" style={{ gap: 'var(--space-2)' }}>
      {options.length > 0 && (
        <div className="chip-list">
          {options.map(option => (
            <span className="chip" key={option}>
              <span>{option}</span>
              <button
                type="button"
                aria-label={`Quitar ${option}`}
                onClick={() => onChange(options.filter(o => o !== option))}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        placeholder="Escribe una opción y pulsa Intro"
        onChange={event => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
