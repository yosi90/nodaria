import { Library, Link2, Plus, Unlink, TriangleAlert } from 'lucide-react';
import { useCallback, useState, type DragEvent, type ReactNode } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { isFieldLink, usersOfLibraryField } from '../../domain/library';
import { inheritedSchemas } from '../../domain/selectors';
import { fieldOverlaps, type FieldOverlap } from '../../domain/inheritance';
import type { FieldDefinition, FieldLink, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { useToast } from '../common/toasts';
import { Menu } from '../common/Menu';
import { OptionList } from '../common/OptionList';
import { Popover } from '../common/Popover';
import { FieldEditor } from './FieldEditor';

const entryId = (f: FieldDefinition | FieldLink) => (isFieldLink(f) ? f.ref : f.id);

/** Atributos de un tipo: propios (editables aquí) y vinculados de la biblioteca (editables allí). */
export function AttributesCard({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const { setView } = useNavigation();
  const onOpenLibrary = () => setView('properties');
  const toast = useToast();
  const [dragged, setDragged] = useState<string | null>(null);
  // Mientras se arrastra, la lista se enseña ya reordenada y el elemento movido va como fantasma.
  const [preview, setPreview] = useState<{ targetId: string; after: boolean } | null>(null);
  const reordered = (list: Schema['fields'], moving: string, targetId: string, after: boolean) => {
    const item = list.find(f => entryId(f) === moving);
    if (!item || moving === targetId) return list;
    const rest = list.filter(f => entryId(f) !== moving);
    const index = rest.findIndex(f => entryId(f) === targetId);
    if (index < 0) return list;
    rest.splice(index + (after ? 1 : 0), 0, item);
    return rest;
  };
  const shownFields =
    dragged && preview ? reordered(schema.fields, dragged, preview.targetId, preview.after) : schema.fields;
  const hover = (targetId: string, after: boolean) => {
    if (!dragged || targetId === dragged) return;
    setPreview(current =>
      current && current.targetId === targetId && current.after === after ? current : { targetId, after },
    );
  };
  const endDrag = () => {
    setDragged(null);
    setPreview(null);
  };
  const [addAnchor, setAddAnchor] = useState<Anchor | null>(null);
  const [linkAnchor, setLinkAnchor] = useState<Anchor | null>(null);
  const closeAdd = useCallback(() => setAddAnchor(null), []);
  const closeLink = useCallback(() => setLinkAnchor(null), []);
  const update = (fields: Schema['fields']) => dispatch({ type: 'update-schema', schema: { ...schema, fields } });
  const ancestors = inheritedSchemas(project, schema.id).slice(0, -1);
  const overlaps = new Map(fieldOverlaps(project, schema).map(o => [o.field.id, o]));
  const setYield = (fieldId: string, yields: boolean) =>
    dispatch({
      type: 'update-schema',
      schema: {
        ...schema,
        yieldFieldIds: yields
          ? [...new Set([...schema.yieldFieldIds, fieldId])]
          : schema.yieldFieldIds.filter(id => id !== fieldId),
      },
    });
  const overlapNote = (overlap: FieldOverlap | undefined, onRemove: () => void) => {
    if (!overlap) return null;
    if (overlap.kind === 'duplicate') {
      return (
        <div className="overlap-note">
          <TriangleAlert size={13} aria-hidden />
          <span>
            Desactivado por herencia: mientras «{schema.name}» herede de «{overlap.from.name}» este atributo no se usa
            ni se tiene en cuenta (lo aporta ya el heredado). Puedes conservarlo por si deshaces la herencia, o{' '}
            <button type="button" className="link-button" onClick={onRemove}>
              quitarlo de este tipo
            </button>
            .
          </span>
        </div>
      );
    }
    return (
      <div className="overlap-note">
        <TriangleAlert size={13} aria-hidden />
        <span>
          Repite la clave «{overlap.field.key}» de «{overlap.inherited.label}», heredado de «{overlap.from.name}».
          Prevalece:{' '}
          <select
            value={overlap.yields ? 'inherited' : 'own'}
            onChange={event => setYield(overlap.field.id, event.target.value === 'inherited')}
          >
            <option value="own">este (más específico)</option>
            <option value="inherited">el heredado</option>
          </select>
        </span>
      </div>
    );
  };
  const linkedIds = new Set(schema.fields.filter(isFieldLink).map(f => f.ref));
  const linkable = project.fieldLibrary.filter(f => !linkedIds.has(f.id));

  const reorder = () => {
    // Al soltar se confirma lo que ya se veía en la previsualización.
    if (dragged && preview) update(reordered(schema.fields, dragged, preview.targetId, preview.after));
    endDrag();
  };

  const removeOwn = (field: FieldDefinition) => {
    toast({ message: `Atributo «${field.label}» eliminado`, undoable: true });
    dispatch({ type: 'delete-field', schemaId: schema.id, fieldId: field.id });
  };
  const share = (field: FieldDefinition) => {
    toast({ message: `«${field.label}» ahora es una preforma`, undoable: true });
    dispatch({ type: 'share-field', schemaId: schema.id, fieldId: field.id });
  };
  const unlink = (field: FieldDefinition) => {
    toast({ message: `«${field.label}» desvinculado de «${schema.name}»`, undoable: true });
    dispatch({ type: 'unlink-field', schemaId: schema.id, libraryId: field.id });
  };

  return (
    <div className="card" data-tour="attributes">
      <div className="card-head">
        <h3>Atributos</h3>
        <Button
          size="sm"
          icon={Plus}
          onClick={event => (addAnchor ? closeAdd() : setAddAnchor(anchorOf(event.currentTarget)))}
        >
          Añadir
        </Button>
      </div>
      {addAnchor && (
        <Menu
          anchor={addAnchor}
          onClose={closeAdd}
          label="Añadir atributo"
          entries={[
            {
              label: 'Definición rápida',
              hint: 'solo este tipo',
              icon: Plus,
              onSelect: () => dispatch({ type: 'add-field', schemaId: schema.id }),
            },
            {
              label: 'Preforma…',
              icon: Link2,
              hint: linkable.length ? `${linkable.length} disponibles` : 'ninguna',
              disabled: !linkable.length,
              onSelect: () => setLinkAnchor(addAnchor),
            },
            {
              label: 'Gestionar preformas',
              icon: Library,
              onSelect: onOpenLibrary,
            },
          ]}
        />
      )}
      {linkAnchor && (
        <Popover anchor={linkAnchor} onClose={closeLink} label="Vincular preforma">
          <OptionList
            title="Preformas"
            options={linkable.map(f => ({
              value: f.id,
              label: f.label,
              hint: FIELD_TYPES.find(t => t[0] === f.type)?.[1],
            }))}
            selected={[]}
            onPick={id => {
              dispatch({ type: 'link-field', schemaId: schema.id, libraryId: id });
              closeLink();
            }}
            emptyLabel="Todas las preformas ya están vinculadas."
          />
        </Popover>
      )}
      {ancestors.length > 0 && (
        <p className="muted-note" style={{ marginBottom: 'var(--space-3)' }}>
          Hereda también los atributos de {ancestors.map(a => `«${a.name}»`).join(', ')}.
        </p>
      )}
      <div className="field-list">
        {schema.fields.length ? (
          shownFields.map(entry => {
            if (isFieldLink(entry)) {
              const field = project.fieldLibrary.find(f => f.id === entry.ref);
              if (!field) return null;
              return (
                <LinkedFieldRow
                  key={entry.ref}
                  field={field}
                  users={usersOfLibraryField(project, field.id).length}
                  dragging={dragged === field.id}
                  onDragStart={() => setDragged(field.id)}
                  onDragEnd={endDrag}
                  onDragHover={hover}
                  onDrop={reorder}
                  onEdit={onOpenLibrary}
                  onUnlink={() => unlink(field)}
                  note={overlapNote(overlaps.get(field.id), () => unlink(field))}
                />
              );
            }
            return (
              <FieldEditor
                key={entry.id}
                field={entry}
                allowTitle={schema.kind === 'entity'}
                dragging={dragged === entry.id}
                onDragStart={setDragged}
                onDragEnd={endDrag}
                onDragHover={hover}
                onDrop={reorder}
                onChange={changed =>
                  update(schema.fields.map(item => (!isFieldLink(item) && item.id === changed.id ? changed : item)))
                }
                onDelete={() => removeOwn(entry)}
                note={overlapNote(overlaps.get(entry.id), () => removeOwn(entry))}
                actions={
                  <IconButton
                    icon={Library}
                    size="sm"
                    label="Convertir en preforma"
                    tooltipSide="left"
                    onClick={() => share(entry)}
                  />
                }
              />
            );
          })
        ) : (
          <p className="empty-copy">
            Aún no tiene atributos. Añade una definición rápida o vincula una preforma, como un «Nombre» común a varios
            tipos.
          </p>
        )}
      </div>
    </div>
  );
}

function LinkedFieldRow({
  field,
  users,
  dragging,
  onDragStart,
  onDragEnd,
  onDragHover,
  onDrop,
  onEdit,
  onUnlink,
  note,
}: {
  field: FieldDefinition;
  users: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragHover: (targetId: string, after: boolean) => void;
  onDrop: () => void;
  onEdit: () => void;
  onUnlink: () => void;
  note?: ReactNode;
}) {
  const over = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onDragHover(field.id, event.clientY > bounds.top + bounds.height / 2);
  };
  return (
    <div
      className={`field-def linked ${dragging ? 'dragging' : ''}`}
      onDragOver={over}
      onDrop={event => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="field-def-head">
        <button
          type="button"
          className="drag-handle"
          draggable
          aria-label={`Reordenar ${field.label}`}
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <Link2 size={14} aria-hidden />
        </button>
        <button type="button" className="field-def-toggle" onClick={onEdit} title="Editar en la biblioteca">
          <strong>{field.label}</strong>
          <span className="badge accent">Preforma · {users}</span>
          {field.isTitle && <span className="badge accent">Título</span>}
          {field.required && <span className="badge warning">Obligatorio</span>}
          <span className="badge">{FIELD_TYPES.find(t => t[0] === field.type)?.[1]}</span>
        </button>
        <IconButton icon={Unlink} size="sm" label="Desvincular de este tipo" tooltipSide="left" onClick={onUnlink} />
      </div>
      {note}
    </div>
  );
}
