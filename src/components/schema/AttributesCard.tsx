import { Copy, Eye, EyeOff, GitBranch, Library, Link2, Plus, Unlink, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { isTypingTarget } from '../common/keyboard';
import { FIELD_TYPES } from '../../domain/constants';
import { isFieldLink, usersOfLibraryField } from '../../domain/library';
import { allFields, effectiveFields, inheritedSchemas } from '../../domain/selectors';
import { openSchemaDefinition } from '../layout/schemaNavigation';
import { fieldOverlaps, inheritedFields, type FieldOverlap } from '../../domain/inheritance';
import type { FieldDefinition, FieldLink, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { anchorOf, pointAnchor, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { useToast } from '../common/toasts';
import { Menu } from '../common/Menu';
import { OptionList } from '../common/OptionList';
import { Popover } from '../common/Popover';
import { dropTarget, useDragReorder } from './dragReorder';
import { DragHandle, FieldEditor } from './FieldEditor';
import { ShareFieldModal } from './ShareFieldModal';
import { sameKeyFields } from '../../domain/preformAdoption';

const entryId = (f: FieldDefinition | FieldLink) => (isFieldLink(f) ? f.ref : f.id);

/** Con tantos atributos, el «Añadir» de arriba suele quedar fuera de la vista: se repite abajo (R3-01). */
const BOTTOM_ADD_FROM = 6;
/**
 * Anchura de la tarjeta a partir de la que los atributos van en dos columnas, y por debajo de la que vuelven
 * a una: el margen evita que abrir un atributo (y que aparezca la barra de desplazamiento) cambie la rejilla.
 */
const TWO_COLUMNS_FROM = 960;
const ONE_COLUMN_BELOW = 920;

/**
 * Dos columnas que crecen cada una por su cuenta (R3-06): abrir un atributo no empuja hacia abajo los de la
 * otra columna, como pasaba con una rejilla de filas compartidas. Se mide la tarjeta, no la ventana.
 */
function useTwoColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [two, setTwo] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setTwo(current => (current ? width >= ONE_COLUMN_BELOW : width >= TWO_COLUMNS_FROM));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, two };
}

/** Atributos de un tipo: propios (editables aquí) y vinculados de la biblioteca (editables allí). */
export function AttributesCard({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const { setView } = useNavigation();
  const onOpenLibrary = () => setView('properties');
  const toast = useToast();
  // Filas de la lista: todos los atributos del tipo, heredados incluidos, en su orden (`fieldOrder`). Los
  // heredados que este tipo oculta siguen en la lista, atenuados, para poder recuperarlos.
  const visible = new Set(allFields(project, schema.id).map(f => f.id));
  const ownIds = schema.fields.map(entryId);
  const rowIds = [
    ...new Set([
      ...effectiveFields(project, schema.id, true)
        .filter(f => visible.has(f.id) || ownIds.includes(f.id) || schema.hiddenFieldIds.includes(f.id))
        .map(f => f.id),
      ...ownIds,
    ]),
  ];
  const { dragged, start: setDragged, hover, end: endDrag, shown: shownIds, dropped } = useDragReorder(rowIds);
  const [addAnchor, setAddAnchor] = useState<Anchor | null>(null);
  const [linkAnchor, setLinkAnchor] = useState<Anchor | null>(null);
  const closeAdd = useCallback(() => setAddAnchor(null), []);
  const closeLink = useCallback(() => setLinkAnchor(null), []);
  const { ref: cardRef, two } = useTwoColumns();
  const addQuick = useCallback(() => dispatch({ type: 'add-field', schemaId: schema.id }), [dispatch, schema.id]);

  // Atajos con el tipo abierto (R3-03): A añade un atributo y P abre las preformas donde está el ratón.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target))
        return;
      if (document.querySelector('dialog[open], [role="menu"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        addQuick();
      } else if (key === 'p') {
        event.preventDefault();
        const at = pointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
        setLinkAnchor(pointAnchor(at.x, at.y));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [addQuick]);
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
  const inherited = inheritedFields(project, schema);

  const reorder = () => {
    // Al soltar se confirma lo que ya se veía en la previsualización: el orden de todos los atributos del
    // tipo (`fieldOrder`) y, con él, el de sus propios atributos y vínculos.
    if (dropped) {
      const fieldOrder = dropped;
      const fields = [...schema.fields].sort((a, b) => fieldOrder.indexOf(entryId(a)) - fieldOrder.indexOf(entryId(b)));
      dispatch({ type: 'update-schema', schema: { ...schema, fields, fieldOrder } });
    }
    endDrag();
  };
  const setHidden = (fieldId: string, hidden: boolean) =>
    dispatch({
      type: 'update-schema',
      schema: {
        ...schema,
        hiddenFieldIds: hidden
          ? [...new Set([...schema.hiddenFieldIds, fieldId])]
          : schema.hiddenFieldIds.filter(id => id !== fieldId),
      },
    });

  const removeOwn = (field: FieldDefinition) => {
    toast({ message: `Atributo «${field.label}» eliminado`, undoable: true });
    dispatch({ type: 'delete-field', schemaId: schema.id, fieldId: field.id });
  };
  const [sharing, setSharing] = useState<FieldDefinition | null>(null);
  const share = (field: FieldDefinition) => {
    // Si otros tipos repiten su clave interna, se pregunta si pasan también a la preforma.
    if (sameKeyFields(project, schema.id, field.id).length) return setSharing(field);
    toast({ message: `«${field.label}» ahora es una preforma`, undoable: true });
    dispatch({ type: 'share-field', schemaId: schema.id, fieldId: field.id });
  };
  const unlink = (field: FieldDefinition) => {
    toast({ message: `«${field.label}» desvinculado de «${schema.name}»`, undoable: true });
    dispatch({ type: 'unlink-field', schemaId: schema.id, libraryId: field.id });
  };

  const toggleAdd = (element: HTMLElement) => (addAnchor ? closeAdd() : setAddAnchor(anchorOf(element)));
  const duplicate = (field: FieldDefinition) => {
    toast({ message: `«${field.label}» duplicado`, undoable: true });
    dispatch({ type: 'duplicate-field', schemaId: schema.id, fieldId: field.id });
  };

  return (
    <div className="card attributes-card" data-tour="attributes" data-schema-id={schema.id} ref={cardRef}>
      {sharing && <ShareFieldModal schema={schema} field={sharing} onClose={() => setSharing(null)} />}
      <div className="card-head">
        <h3>Atributos</h3>
        <Button
          size="sm"
          icon={Plus}
          title="Añadir un atributo (A) o una preforma (P)"
          onClick={event => toggleAdd(event.currentTarget)}
        >
          Añadir
        </Button>
      </div>
      {addAnchor && (
        <Menu
          anchor={addAnchor}
          onClose={closeAdd}
          onHoverItem={closeLink}
          label="Añadir atributo"
          entries={[
            {
              label: 'Definición rápida',
              hint: 'A',
              icon: Plus,
              onSelect: addQuick,
            },
            {
              // Las preformas se abren en un submenú al pasar por encima (R3-02).
              label: 'Preformas',
              icon: Link2,
              hint: linkable.length
                ? `${linkable.filter(f => !inherited.some(i => i.field.id === f.id)).length} · P`
                : 'ninguna',
              disabled: !linkable.length,
              onSelect: () => undefined,
              submenu: anchor => setLinkAnchor(anchor),
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
        <Popover anchor={linkAnchor} onClose={closeLink} label="Vincular preforma" className="preform-options">
          <OptionList
            title="Preformas"
            options={linkable.map(f => {
              const same = inherited.find(i => i.field.id === f.id);
              const clash = inherited.find(i => i.field.key === f.key);
              return {
                value: f.id,
                label: f.label,
                hint: same
                  ? `Ya heredada de «${same.from.name}»`
                  : clash
                    ? `Misma clave que «${clash.field.label}», heredada de «${clash.from.name}»`
                    : FIELD_TYPES.find(t => t[0] === f.type)?.[1],
                disabled: Boolean(same),
              };
            })}
            selected={[]}
            onPick={id => {
              dispatch({ type: 'link-field', schemaId: schema.id, libraryId: id });
              closeLink();
              closeAdd();
            }}
            emptyLabel="Todas las preformas ya están vinculadas."
          />
        </Popover>
      )}
      {ancestors.length > 0 && (
        <p className="muted-note" style={{ marginBottom: 'var(--space-3)' }}>
          Hereda de {ancestors.map(a => `«${a.name}»`).join(', ')}. Los atributos heredados se editan en su tipo; aquí
          puedes ordenarlos con los propios u ocultarlos solo en este tipo y sus subtipos.
        </p>
      )}
      <AttributeColumns two={two}>
        {shownIds.length ? (
          shownIds.map(id => {
            const entry = schema.fields.find(f => entryId(f) === id);
            if (!entry) {
              const source = inherited.find(i => i.field.id === id);
              if (!source) return null;
              return (
                <InheritedFieldRow
                  key={id}
                  field={source.field}
                  from={source.from}
                  shared={project.fieldLibrary.some(f => f.id === id)}
                  hidden={schema.hiddenFieldIds.includes(id)}
                  dragging={dragged === id}
                  onDragStart={() => setDragged(id)}
                  onDragEnd={endDrag}
                  onDragHover={hover}
                  onDrop={reorder}
                  onOpen={() => openSchemaDefinition(source.from.id, source.from.kind, setView)}
                  onHidden={hidden => setHidden(id, hidden)}
                />
              );
            }
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
                schemaId={schema.id}
                allowTitle={schema.kind === 'entity'}
                siblings={allFields(project, schema.id)}
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
                  <>
                    <IconButton
                      icon={Copy}
                      size="sm"
                      label="Duplicar el atributo"
                      tooltipSide="left"
                      onClick={() => duplicate(entry)}
                    />
                    <IconButton
                      icon={Library}
                      size="sm"
                      label="Convertir en preforma"
                      tooltipSide="left"
                      onClick={() => share(entry)}
                    />
                  </>
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
      </AttributeColumns>
      {shownIds.length >= BOTTOM_ADD_FROM && (
        <div className="attributes-bottom">
          <Button size="sm" icon={Plus} onClick={event => toggleAdd(event.currentTarget)}>
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}

/** La lista de atributos, en una columna o en dos que no comparten filas (por orden: izquierda, derecha…). */
function AttributeColumns({ two, children }: { two: boolean; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  if (!two || items.length < 2) return <div className="field-list">{children}</div>;
  return (
    <div className="field-list two-columns">
      <div className="field-column">{items.filter((_, i) => i % 2 === 0)}</div>
      <div className="field-column">{items.filter((_, i) => i % 2 === 1)}</div>
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
  return (
    <div className={`field-def linked ${dragging ? 'dragging' : ''}`} {...dropTarget(field.id, onDragHover, onDrop)}>
      <div className="field-def-head">
        <DragHandle label={field.label} icon={Link2} size={14} onDragStart={onDragStart} onDragEnd={onDragEnd} />
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

/** Atributo heredado en la lista del tipo: se ordena con los propios y se puede ocultar aquí; se edita en su tipo. */
function InheritedFieldRow({
  field,
  from,
  shared,
  hidden,
  dragging,
  onDragStart,
  onDragEnd,
  onDragHover,
  onDrop,
  onOpen,
  onHidden,
}: {
  field: FieldDefinition;
  from: Schema;
  shared: boolean;
  hidden: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragHover: (targetId: string, after: boolean) => void;
  onDrop: () => void;
  onOpen: () => void;
  onHidden: (hidden: boolean) => void;
}) {
  return (
    <div
      className={`field-def linked inherited ${hidden ? 'hidden-field' : ''} ${dragging ? 'dragging' : ''}`}
      {...dropTarget(field.id, onDragHover, onDrop)}
    >
      <div className="field-def-head">
        <DragHandle label={field.label} icon={GitBranch} size={14} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        <button type="button" className="field-def-toggle" onClick={onOpen} title={`Editar en «${from.name}»`}>
          <strong>{field.label}</strong>
          <span className="badge">De «{from.name}»</span>
          {shared && <span className="badge accent">Preforma</span>}
          {hidden && <span className="badge warning">Oculto en este tipo</span>}
          {field.isTitle && <span className="badge accent">Título</span>}
          <span className="badge">{FIELD_TYPES.find(t => t[0] === field.type)?.[1]}</span>
        </button>
        <IconButton
          icon={hidden ? EyeOff : Eye}
          size="sm"
          active={hidden}
          label={hidden ? 'Volver a usarlo en este tipo' : 'Ocultarlo en este tipo y sus subtipos'}
          tooltipSide="left"
          onClick={() => onHidden(!hidden)}
        />
      </div>
    </div>
  );
}
