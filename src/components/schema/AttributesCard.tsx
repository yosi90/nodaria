import { Library, Link2, Plus, Unlink } from 'lucide-react';
import { useCallback, useState, type DragEvent } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { isFieldLink, usersOfLibraryField } from '../../domain/library';
import { inheritedSchemas } from '../../domain/selectors';
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
  const [addAnchor, setAddAnchor] = useState<Anchor | null>(null);
  const [linkAnchor, setLinkAnchor] = useState<Anchor | null>(null);
  const closeAdd = useCallback(() => setAddAnchor(null), []);
  const closeLink = useCallback(() => setLinkAnchor(null), []);
  const update = (fields: Schema['fields']) => dispatch({ type: 'update-schema', schema: { ...schema, fields } });
  const ancestors = inheritedSchemas(project, schema.id).slice(0, -1);
  const linkedIds = new Set(schema.fields.filter(isFieldLink).map(f => f.ref));
  const linkable = project.fieldLibrary.filter(f => !linkedIds.has(f.id));

  const reorder = (targetId: string, after: boolean) => {
    if (!dragged || dragged === targetId) return;
    const moving = schema.fields.find(f => entryId(f) === dragged);
    if (!moving) return;
    const rest = schema.fields.filter(f => entryId(f) !== dragged);
    const index = rest.findIndex(f => entryId(f) === targetId);
    rest.splice(index + (after ? 1 : 0), 0, moving);
    update(rest);
    setDragged(null);
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
    <div className="card">
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
          schema.fields.map(entry => {
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
                  onDragEnd={() => setDragged(null)}
                  onDrop={reorder}
                  onEdit={onOpenLibrary}
                  onUnlink={() => unlink(field)}
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
                onDragEnd={() => setDragged(null)}
                onDrop={reorder}
                onChange={changed =>
                  update(schema.fields.map(item => (!isFieldLink(item) && item.id === changed.id ? changed : item)))
                }
                onDelete={() => removeOwn(entry)}
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
  onDrop,
  onEdit,
  onUnlink,
}: {
  field: FieldDefinition;
  users: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, after: boolean) => void;
  onEdit: () => void;
  onUnlink: () => void;
}) {
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onDrop(field.id, event.clientY > bounds.top + bounds.height / 2);
  };
  return (
    <div
      className={`field-def linked ${dragging ? 'dragging' : ''}`}
      onDragOver={e => e.preventDefault()}
      onDrop={drop}
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
    </div>
  );
}
