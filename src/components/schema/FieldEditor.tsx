import { ChevronDown, ChevronRight, GripVertical, Lock, Trash2, X } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { slugify } from '../../domain/factories';
import { IMAGE_SHAPES, type ImageShape } from '../../domain/portrait';
import type { FieldDefinition, NodeDisplay } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { IconButton } from '../common/Button';
import { schemaOption } from '../common/options';
import { IconPicker } from '../common/IconPicker';
import { MultiSelect } from '../common/Select';

interface FieldEditorProps {
  field: FieldDefinition;
  dragging: boolean;
  onChange: (field: FieldDefinition) => void;
  onDelete: () => void;
  onDragStart: (fieldId: string) => void;
  onDragEnd: () => void;
  /** Al pasar por encima arrastrando otro atributo: dónde quedaría (antes o después de este). */
  onDragHover?: (targetId: string, after: boolean) => void;
  onDrop: () => void;
  /** Insignias y acciones extra en la cabecera (p. ej. «Compartido», «Usado en 3 tipos»). */
  badges?: ReactNode;
  actions?: ReactNode;
  /** Aviso bajo la cabecera (p. ej. solape con un atributo heredado). */
  note?: ReactNode;
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
  onDragHover,
  onDrop,
  badges,
  actions,
  note,
  allowTitle = true,
}: FieldEditorProps) {
  const { project } = useApp();
  const { openHelp } = useNavigation();
  const [expanded, setExpanded] = useState(field.key === 'nuevo_campo' || field.key.startsWith('nuevo_campo_'));
  const set = <K extends keyof FieldDefinition>(key: K, value: FieldDefinition[K]) =>
    onChange({ ...field, [key]: value });
  const updateLabel = (label: string) => {
    const keyWasAutomatic = !field.key || field.key === slugify(field.label) || field.key.startsWith('nuevo_campo');
    onChange({ ...field, label, key: keyWasAutomatic ? slugify(label) : field.key });
  };
  const typeLabel = FIELD_TYPES.find(item => item[0] === field.type)?.[1];
  // «Género» es un atributo de sistema: lo usa el parentesco y no se edita (solo se reordena o se quita).
  const system = field.type === 'gender';
  const hasDefault = !['computed', 'nodeRef', 'nodeRefs', 'image', 'gender', 'color', 'url'].includes(field.type);

  const over = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onDragHover?.(field.id, event.clientY > bounds.top + bounds.height / 2);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onDrop();
  };

  return (
    <div
      className={`field-def ${dragging ? 'dragging' : ''} ${system ? 'system' : ''}`}
      onDragOver={over}
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
        {system ? (
          <div className="field-def-toggle system-row">
            <span className="field-chevron" title="Atributo de sistema: no se edita">
              <Lock size={13} />
            </span>
            <strong>{field.label || 'Género'}</strong>
            <span className="system-note">
              Lo usa el parentesco (Padre / Madre, Hijo / Hija…). Se rellena en cada ficha; aquí no se edita.
            </span>
            {badges}
            <span className="badge system">Sistema</span>
          </div>
        ) : (
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
        )}
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
      {note}
      {expanded && !system && (
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
              <select
                value={field.type}
                onChange={event => {
                  const type = event.target.value as FieldDefinition['type'];
                  if (type === 'gender')
                    onChange({
                      ...field,
                      type,
                      label: 'Género',
                      key: 'genero',
                      required: false,
                      isTitle: false,
                      description: field.description || 'Decide el nombre de los parentescos.',
                    });
                  else if (type === 'image') onChange({ ...field, type, portrait: true });
                  else set('type', type);
                }}
              >
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
                {field.type === 'select' ? (
                  <select
                    value={field.options.includes(String(field.defaultValue ?? '')) ? String(field.defaultValue) : ''}
                    onChange={event => set('defaultValue', event.target.value)}
                  >
                    <option value="">Sin valor inicial</option>
                    {field.options.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'boolean' ? (
                  <select
                    value={
                      ['true', 'sí', 'si', '1'].includes(
                        String(field.defaultValue ?? '')
                          .trim()
                          .toLowerCase(),
                      )
                        ? 'sí'
                        : 'no'
                    }
                    onChange={event => set('defaultValue', event.target.value)}
                  >
                    <option value="no">No</option>
                    <option value="sí">Sí</option>
                  </select>
                ) : (
                  <input
                    value={String(field.defaultValue ?? '')}
                    onChange={event => set('defaultValue', event.target.value)}
                  />
                )}
              </label>
            )}
          </div>
          <div className="field-row">
            <div className="field">
              Icono
              <div className="check-row" style={{ alignItems: 'center' }}>
                <IconPicker value={field.icon} onChange={icon => set('icon', icon)} label="Icono del atributo" />
                <label className="field-inline">
                  Mostrar en el nodo
                  <select
                    aria-label="Mostrar en el nodo"
                    value={field.nodeDisplay}
                    onChange={event => set('nodeDisplay', event.target.value as NodeDisplay)}
                  >
                    {NODE_DISPLAYS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <small>
                {field.type === 'select'
                  ? 'Se muestra la opción elegida con su icono (o el del atributo). Cada opción puede decidir lo suyo abajo.'
                  : '«Solo icono» añade el icono junto al tipo cuando el atributo tiene valor; «Icono y texto» añade una línea con el nombre y el valor.'}
              </small>
            </div>
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
            <div className="field">
              Imagen
              <div className="field-row">
                <label className="field">
                  Forma
                  <select
                    value={field.imageShape}
                    onChange={event => set('imageShape', event.target.value as ImageShape)}
                  >
                    {IMAGE_SHAPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="check-row" style={{ alignSelf: 'end' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.imageBorder}
                      onChange={event => set('imageBorder', event.target.checked)}
                    />
                    Con borde
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={field.portrait}
                      onChange={event => set('portrait', event.target.checked)}
                    />
                    Retrato del nodo
                  </label>
                </div>
              </div>
              <small>
                La imagen se reduce al guardarla (máximo 384 px). «Retrato del nodo» la pone en lugar del icono del tipo
                en la tarjeta, el árbol, las listas y la ficha. Las demás imágenes se enseñan en la tarjeta según
                «Mostrar en el nodo»: «Solo icono» añade una miniatura junto al tipo e «Icono y texto» una línea con la
                miniatura y el nombre del atributo.
              </small>
            </div>
          )}
          {field.type === 'select' && (
            <div className="field">
              Opciones
              <OptionsEditor
                options={field.options}
                icons={field.optionIcons}
                display={field.optionDisplay}
                onChange={options => set('options', options)}
                onIconsChange={icons => set('optionIcons', icons)}
                onDisplayChange={display => set('optionDisplay', display)}
              />
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
              <small>
                Entre llaves: <code>{'{clave}'}</code>, <code>{'{referencia.clave}'}</code>, <code>{'{padre}'}</code>,{' '}
                <code>{'{contar(relaciones:Tipo)}'}</code>, <code>{'{lista(hijos)}'}</code>…{' '}
                <button type="button" className="link-button" onClick={() => openHelp('formulas')}>
                  Ver la guía de fórmulas
                </button>
              </small>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

const NODE_DISPLAYS: [NodeDisplay, string][] = [
  ['none', 'No'],
  ['icon', 'Solo icono'],
  ['text', 'Icono y texto'],
];

/** Opciones de una lista: chips que se añaden con Intro o coma y se quitan con su botón; cada una puede llevar icono. */
function OptionsEditor({
  options,
  icons,
  display,
  onChange,
  onIconsChange,
  onDisplayChange,
}: {
  options: string[];
  icons: Record<string, string>;
  display: Record<string, NodeDisplay>;
  onChange: (options: string[]) => void;
  onIconsChange: (icons: Record<string, string>) => void;
  onDisplayChange: (display: Record<string, NodeDisplay>) => void;
}) {
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
            <span className="chip option-chip" key={option}>
              <IconPicker
                value={icons[option] ?? null}
                size={22}
                label={`Icono de ${option}`}
                onChange={icon => {
                  const next = { ...icons };
                  if (icon) next[option] = icon;
                  else delete next[option];
                  onIconsChange(next);
                }}
              />
              <span>{option}</span>
              <select
                className="option-display"
                aria-label={`Mostrar ${option} en el nodo`}
                title="Cómo se enseña esta opción en el nodo"
                value={display[option] ?? ''}
                onChange={e => {
                  const next = { ...display };
                  if (e.target.value) next[option] = e.target.value as NodeDisplay;
                  else delete next[option];
                  onDisplayChange(next);
                }}
              >
                <option value="">Como el atributo</option>
                {NODE_DISPLAYS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Quitar ${option}`}
                onClick={() => {
                  onChange(options.filter(o => o !== option));
                  if (icons[option]) {
                    const next = { ...icons };
                    delete next[option];
                    onIconsChange(next);
                  }
                }}
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
