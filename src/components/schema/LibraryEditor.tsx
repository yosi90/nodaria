import { Library, Plus } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../../domain/factories';
import { usersOfLibraryField } from '../../domain/library';
import type { FieldDefinition } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { schemaOption } from '../common/options';
import { MultiSelect } from '../common/Select';
import { useToast } from '../common/toasts';
import { FieldEditor } from './FieldEditor';

/** Vista «Propiedades»: preformas de atributo que se definen una vez y se vinculan a varios tipos. */
export function LibraryEditor() {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const toast = useToast();
  const [dragged, setDragged] = useState<string | null>(null);
  const library = project.fieldLibrary;

  const add = () => dispatch({ type: 'add-library-field', id: uid('field') });
  // Mientras se arrastra, la lista se enseña ya reordenada y el elemento movido va como fantasma.
  const [preview, setPreview] = useState<{ targetId: string; after: boolean } | null>(null);
  const reordered = (targetId: string, after: boolean) => {
    const moving = library.find(f => f.id === dragged);
    if (!moving || dragged === targetId) return library;
    const rest = library.filter(f => f.id !== dragged);
    const index = rest.findIndex(f => f.id === targetId);
    if (index < 0) return library;
    rest.splice(index + (after ? 1 : 0), 0, moving);
    return rest;
  };
  const shown = dragged && preview ? reordered(preview.targetId, preview.after) : library;
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
  const reorder = () => {
    if (dragged && preview) {
      dispatch({ type: 'reorder-library', ids: reordered(preview.targetId, preview.after).map(f => f.id) });
    }
    endDrag();
  };

  const remove = async (field: FieldDefinition) => {
    const users = usersOfLibraryField(project, field.id);
    if (users.length) {
      const ok = await confirm({
        title: `Eliminar «${field.label}»`,
        message: `Está vinculado a ${users.map(s => `«${s.name}»`).join(', ')}. Se borrará de esos tipos y de sus nodos.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
    }
    toast({ message: `Preforma «${field.label}» eliminada`, undoable: true });
    dispatch({ type: 'delete-library-field', id: field.id });
  };

  const setUsers = (field: FieldDefinition, typeIds: string[]) => {
    const current = new Set(usersOfLibraryField(project, field.id).map(s => s.id));
    typeIds
      .filter(id => !current.has(id))
      .forEach(id => dispatch({ type: 'link-field', schemaId: id, libraryId: field.id }));
    [...current]
      .filter(id => !typeIds.includes(id))
      .forEach(id => dispatch({ type: 'unlink-field', schemaId: id, libraryId: field.id }));
  };

  return (
    <section className="schema-editor">
      <div className="schema-heading" style={{ maxWidth: 1120, margin: '0 auto var(--space-6)' }}>
        <span className="type-icon lg" aria-hidden>
          <Library size={18} />
        </span>
        <div className="titles">
          <h1>Propiedades</h1>
          <p>
            Preformas de atributo: defínelas una vez y vincúlalas a los tipos que quieras. Cambiarlas aquí las cambia en
            todos.
          </p>
        </div>
        <Button icon={Plus} variant="primary" onClick={add}>
          Nueva preforma
        </Button>
      </div>
      <div className="library-list">
        {library.length ? (
          shown.map(field => {
            const users = usersOfLibraryField(project, field.id);
            return (
              <FieldEditor
                key={field.id}
                field={field}
                siblings={project.fieldLibrary}
                dragging={dragged === field.id}
                onDragStart={setDragged}
                onDragEnd={endDrag}
                onDragHover={hover}
                onDrop={reorder}
                onChange={changed => dispatch({ type: 'update-library-field', field: changed })}
                onDelete={() => void remove(field)}
                badges={
                  <span className="badge accent">{users.length ? `Usado en ${users.length}` : 'Sin vincular'}</span>
                }
                actions={
                  <div className="library-users">
                    <MultiSelect
                      options={project.schemas.map(s => schemaOption(s))}
                      value={users.map(s => s.id)}
                      addLabel="Vincular tipo"
                      onChange={ids => setUsers(field, ids)}
                    />
                  </div>
                }
              />
            );
          })
        ) : (
          <p className="empty-copy">
            Aún no hay preformas. Crea aquí un «Nombre» o un «Retrato» y vincúlalo a varios tipos, o convierte en
            preforma un atributo propio desde cualquier tipo.
          </p>
        )}
      </div>
    </section>
  );
}
