import { ArrowRightLeft, FolderInput, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { bulkPreview, type BulkPatch } from '../../domain/operations';
import { canContain, descendants, getNode, nodeLabel } from '../../domain/selectors';
import type { FieldDefinition, Node, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Popover } from '../common/Popover';
import { TagsInput } from '../common/TagsInput';
import { useToast } from '../common/toasts';

/*
 * Barra de operaciones masivas de la tabla: con varias filas marcadas permite cambiarlas de tipo,
 * moverlas bajo otro nodo (o a la raíz), añadirles etiquetas o eliminarlas de una vez. Cada acción
 * se puede deshacer. Lo que no cabe en una fila concreta (padre que no la admite, ciclo) se omite.
 */

type Menu = 'type' | 'move' | 'tags' | null;

export function BulkBar({
  ids,
  schema,
  fields,
  onDone,
}: {
  ids: string[];
  schema: Schema;
  fields: FieldDefinition[];
  onDone: () => void;
}) {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const toast = useToast();
  const [menu, setMenu] = useState<Menu>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [typeId, setTypeId] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [tagField, setTagField] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const selected = useMemo(
    () => ids.map(id => getNode(project, id)).filter((n): n is Node => Boolean(n)),
    [ids, project],
  );
  const count = selected.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const typeOptions = project.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  // Padres posibles: nodos fuera de la selección y de sus descendientes que admitan al menos a uno.
  const blocked = useMemo(() => {
    const set = new Set<string>();
    selected.forEach(n => descendants(project, n.id).forEach(d => set.add(d)));
    return set;
  }, [project, selected]);
  const parentOptions = project.nodes.filter(
    n => !blocked.has(n.id) && selected.some(s => canContain(project, n.typeId, s.typeId)),
  );
  const tagFields = fields.filter(f => f.type === 'tags');

  const open = (which: Exclude<Menu, null>, el: HTMLElement) => {
    setMenu(menu === which ? null : which);
    setAnchor(anchorOf(el));
    if (which === 'tags' && !tagField && tagFields[0]) setTagField(tagFields[0].id);
  };
  const close = () => setMenu(null);

  const apply = (patch: BulkPatch, message: string) => {
    dispatch({ type: 'bulk-update-nodes', ids, patch });
    toast({ message, undoable: true });
    close();
    onDone();
  };

  const remove = async () => {
    const nested = blocked.size - count;
    const ok = await confirm({
      title: `Eliminar ${plural(count, 'nodo', 'nodos')}`,
      message: nested
        ? `Se eliminarán con sus ${plural(nested, 'subnodo', 'subnodos')} y todas sus relaciones. Puedes deshacerlo después.`
        : 'Se eliminarán con sus relaciones. Puedes deshacerlo después.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'delete-nodes', ids });
    toast({ message: `${plural(count, 'nodo eliminado', 'nodos eliminados')}`, undoable: true });
    onDone();
  };

  const movePreview = bulkPreview(project, ids, { parentId: parentId || null });

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Operaciones con la selección">
      <strong>{plural(count, 'seleccionado', 'seleccionados')}</strong>
      <Button size="sm" icon={ArrowRightLeft} onClick={e => open('type', e.currentTarget)} aria-haspopup="dialog">
        Cambiar tipo
      </Button>
      <Button size="sm" icon={FolderInput} onClick={e => open('move', e.currentTarget)} aria-haspopup="dialog">
        Mover a
      </Button>
      {tagFields.length > 0 && (
        <Button size="sm" icon={Tag} onClick={e => open('tags', e.currentTarget)} aria-haspopup="dialog">
          Etiquetar
        </Button>
      )}
      <Button size="sm" variant="danger" icon={Trash2} onClick={() => void remove()}>
        Eliminar
      </Button>
      <IconButton icon={X} size="sm" label="Quitar la selección" onClick={onDone} />

      {menu === 'type' && anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Cambiar de tipo">
          <div className="bulk-menu">
            <label className="field">
              Nuevo tipo
              <select value={typeId} onChange={e => setTypeId(e.target.value)}>
                <option value="">Elegir tipo…</option>
                {typeOptions
                  .filter(s => s.id !== schema.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <small>
              Los valores se conservan por atributo compartido y, entre atributos propios, por clave. Las filas pasarán
              a la hoja del nuevo tipo.
            </small>
            <Button
              size="sm"
              variant="primary"
              disabled={!typeId}
              onClick={() =>
                apply(
                  { typeId },
                  `${plural(count, 'nodo', 'nodos')} ahora de tipo «${typeOptions.find(s => s.id === typeId)?.name ?? ''}»`,
                )
              }
            >
              Cambiar
            </Button>
          </div>
        </Popover>
      )}
      {menu === 'move' && anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Mover a">
          <div className="bulk-menu">
            <label className="field">
              Dentro de
              <select value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">Raíz (sin padre)</option>
                {parentOptions.map(n => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(project, n)}
                  </option>
                ))}
              </select>
            </label>
            {movePreview.moved < count && (
              <small>
                Solo se moverán {movePreview.moved} de {count}: el resto no cabe en ese destino o crearía un ciclo.
              </small>
            )}
            <Button
              size="sm"
              variant="primary"
              disabled={movePreview.moved === 0}
              onClick={() =>
                apply(
                  { parentId: parentId || null },
                  parentId
                    ? `${plural(movePreview.moved, 'nodo movido', 'nodos movidos')} dentro de «${nodeLabel(project, getNode(project, parentId)!)}»`
                    : `${plural(movePreview.moved, 'nodo movido', 'nodos movidos')} a la raíz`,
                )
              }
            >
              Mover
            </Button>
          </div>
        </Popover>
      )}
      {menu === 'tags' && anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Etiquetar">
          <div className="bulk-menu">
            {tagFields.length > 1 && (
              <label className="field">
                Atributo
                <select value={tagField} onChange={e => setTagField(e.target.value)}>
                  {tagFields.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field">
              Etiquetas que añadir
              <TagsInput value={tags} onChange={setTags} />
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={!tags.length || !tagField}
              onClick={() => {
                apply(
                  { tags: { fieldId: tagField, add: tags } },
                  `Etiquetas añadidas a ${plural(count, 'nodo', 'nodos')}`,
                );
                setTags([]);
              }}
            >
              Añadir
            </Button>
          </div>
        </Popover>
      )}
    </div>
  );
}
