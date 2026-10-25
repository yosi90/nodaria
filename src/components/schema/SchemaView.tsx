import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderOpen,
  FolderPlus,
  GitFork,
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { OPEN_TYPE_EVENT } from '../layout/schemaNavigation';
import { inheritedSchemas } from '../../domain/selectors';
import { folderOfSchema } from '../../domain/schemaFolders';
import { uid } from '../../domain/factories';
import { schemaTree, type DropZone } from '../../domain/inheritance';
import { vocabulary } from '../../domain/projectKinds';
import { moveSchemaInList, schemaFolderMembers } from '../../domain/schemaFolders';
import type { Schema, SchemaFolder, SchemaKind } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { usePreferences } from '../../state/preferences';
import { useProjectAccess } from '../../state/groups';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';
import { Modal } from '../common/Modal';
import { Splitter } from '../common/Splitter';
import { useToast } from '../common/toasts';
import { SchemaEditor } from './SchemaEditor';
import { withMember } from '../common/sets';

type Entry = { schema: Schema; depth: number };
/** Sangría extra de los tipos que van dentro de una carpeta. */
const FOLDER_INDENT = 14;

export function SchemaView({ kind }: { kind: SchemaKind }) {
  const { project, dispatch } = useApp();
  const { prompt, confirm } = useDialogs();
  const toast = useToast();
  const words = vocabulary(project.kind);
  const isEntity = kind === 'entity';
  const { preferences, setPreference } = usePreferences();
  // Con un compartido, el editor y el lector ven el esquema sin poder cambiarlo.
  const { canEditSchema } = useProjectAccess();
  const ofKind = project.schemas.filter(s => s.kind === kind);
  const [selected, setSelected] = useState<string | null>(ofKind[0]?.id || null);
  const [creating, setCreating] = useState<SchemaKind | null>(null);
  const [createParent, setCreateParent] = useState<string | null>(null);
  const [name, setName] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ targetId: string; zone: DropZone } | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  // Durante el arrastre la lista se enseña ya reordenada (o anidada); al soltar se confirma.
  const shown = dragged && preview ? moveSchemaInList(project, dragged, preview.targetId, preview.zone) : project;
  const dropInside = dragged && preview?.zone === 'inside' ? preview.targetId : null;
  const schema = ofKind.find(item => item.id === selected) ?? ofKind[0];

  // Ramas y carpetas plegadas: preferencia de este navegador, por proyecto y lista.
  const collapseKey = `${project.id}:schemas:${kind}`;
  const collapsed = new Set(preferences.collapsedRows[collapseKey] ?? []);
  const setCollapsed = (keys: string[]) =>
    setPreference('collapsedRows', { ...preferences.collapsedRows, [collapseKey]: keys });
  const toggle = (key: string, open?: boolean) =>
    setCollapsed([...withMember(collapsed, key, !(open ?? collapsed.has(key)))]);

  // Abrir un tipo desde otra vista: se despliegan sus ancestros y su carpeta para que se vea en la lista.
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!project.schemas.some(s => s.id === id && s.kind === kind)) return;
      setSelected(id);
      const chain = inheritedSchemas(project, id);
      const folder = folderOfSchema(project, chain[0].id);
      const hidden = new Set([...chain.slice(0, -1).map(s => s.id), ...(folder ? [`folder:${folder.id}`] : [])]);
      const keep = (preferences.collapsedRows[collapseKey] ?? []).filter(key => !hidden.has(key));
      if (keep.length !== (preferences.collapsedRows[collapseKey] ?? []).length)
        setPreference('collapsedRows', { ...preferences.collapsedRows, [collapseKey]: keep });
      requestAnimationFrame(() =>
        document.querySelector(`[data-type-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }),
      );
    };
    window.addEventListener(OPEN_TYPE_EVENT, open);
    return () => window.removeEventListener(OPEN_TYPE_EVENT, open);
  }, [project, kind, preferences.collapsedRows, collapseKey, setPreference]);

  const openCreateModal = (parentId: string | null = null) => {
    setName('');
    setCreateParent(parentId);
    setCreating(kind);
  };

  const createType = () => {
    const cleanName = name.trim();
    if (!cleanName || !creating) return;
    const id = uid('type');
    dispatch({ type: 'add-schema', name: cleanName, kind: creating, id, parentTypeId: createParent ?? undefined });
    if (createParent) toggle(createParent, true);
    setCreating(null);
    setSelected(id);
  };

  const createFolder = async () => {
    const folderName = await prompt({
      title: 'Nueva carpeta',
      label: 'Nombre',
      placeholder: `Por ejemplo: ${words.folder}`,
      confirmLabel: 'Crear',
    });
    if (folderName) dispatch({ type: 'add-schema-folder', kind, name: folderName });
  };
  const renameFolder = async (folder: SchemaFolder) => {
    const folderName = await prompt({
      title: 'Renombrar carpeta',
      label: 'Nombre',
      initialValue: folder.name,
      confirmLabel: 'Renombrar',
    });
    if (folderName) dispatch({ type: 'rename-schema-folder', id: folder.id, name: folderName });
  };
  const removeFolder = async (folder: SchemaFolder, count: number) => {
    if (
      count > 0 &&
      !(await confirm({
        title: 'Eliminar carpeta',
        message: `Los ${count} tipos de «${folder.name}» vuelven a la lista sin carpeta. No se borra ningún tipo.`,
        confirmLabel: 'Eliminar carpeta',
      }))
    )
      return;
    dispatch({ type: 'delete-schema-folder', id: folder.id });
    toast({ message: `Carpeta «${folder.name}» eliminada`, undoable: true });
  };

  const endDrag = () => {
    setDragged(null);
    setPreview(null);
    setDropFolder(null);
  };
  // Solo los tipos raíz entran en una carpeta: un subtipo va con su árbol de herencia.
  const draggedRoot = dragged ? !project.schemas.find(s => s.id === dragged)?.parentTypeId : false;
  const folderDragOver = (event: DragEvent, folderId: string | null) => {
    if (!dragged || !draggedRoot) return;
    event.preventDefault();
    event.stopPropagation();
    setPreview(null);
    setDropFolder(folderId ?? 'none');
  };
  const folderDrop = (event: DragEvent, folder: SchemaFolder | null) => {
    if (!dragged || !draggedRoot) return;
    event.preventDefault();
    event.stopPropagation();
    dispatch({ type: 'set-schema-folder', schemaId: dragged, folderId: folder?.id ?? null });
    if (folder) toggle(`folder:${folder.id}`, true);
    endDrag();
  };

  // Bloques de la lista: una carpeta por bloque (con los árboles de sus tipos raíz) y los sueltos al final.
  const tree = schemaTree(shown, kind);
  const folders = shown.schemaFolders.filter(f => f.kind === kind);
  const folderOf = new Map<string, string>();
  folders.forEach(f => schemaFolderMembers(shown, f).forEach(s => folderOf.set(s.id, f.id)));
  const subtrees: { rootId: string; entries: Entry[] }[] = [];
  tree.forEach(entry => {
    if (entry.depth === 0) subtrees.push({ rootId: entry.schema.id, entries: [] });
    subtrees[subtrees.length - 1]?.entries.push(entry);
  });
  const blocks: { folder: SchemaFolder | null; entries: Entry[] }[] = [
    ...folders.map(folder => ({
      folder,
      entries: subtrees.filter(t => folderOf.get(t.rootId) === folder.id).flatMap(t => t.entries),
    })),
    { folder: null, entries: subtrees.filter(t => !folderOf.has(t.rootId)).flatMap(t => t.entries) },
  ];
  const parents = new Set(tree.filter((entry, i) => tree[i + 1]?.depth > entry.depth).map(e => e.schema.id));
  const anyCollapsible = parents.size > 0 || folders.length > 0;
  const allCollapsed =
    [...parents].every(id => collapsed.has(id)) && folders.every(f => collapsed.has(`folder:${f.id}`));

  const renderEntries = (entries: Entry[], indent: number) => {
    // Lo que cuelga de una rama plegada no se enseña.
    const items: Entry[] = [];
    let hideBelow: number | null = null;
    entries.forEach(entry => {
      if (hideBelow !== null && entry.depth > hideBelow) return;
      hideBelow = collapsed.has(entry.schema.id) ? entry.depth : null;
      items.push(entry);
    });
    // Guías del árbol: para cada entrada, qué niveles de sus ancestros siguen hacia abajo
    // (línea continua) y si ella es la última hermana (termina en └ en vez de ├).
    const isLast = items.map((entry, i) => {
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].depth < entry.depth) return true;
        if (items[j].depth === entry.depth) return false;
      }
      return true;
    });
    // guides[i][d] (d ≥ 1): si el ancestro de profundidad d sigue teniendo hermanos debajo. Las raíces
    // no se unen entre sí, así que el nivel 0 nunca dibuja guía.
    const guides: boolean[][] = [];
    const stack: boolean[] = [];
    items.forEach((entry, i) => {
      stack.length = entry.depth;
      guides.push(stack.slice(0, entry.depth));
      stack[entry.depth] = !isLast[i];
    });
    return items.map(({ schema: item, depth }, index) => {
      const hasChildren = parents.has(item.id);
      const isCollapsed = collapsed.has(item.id);
      return (
        <div
          key={item.id}
          className={`type-item ${item.id === schema?.id ? 'active' : ''} ${dragged === item.id ? 'dragging' : ''} ${dropInside === item.id ? 'drop-inside' : ''}`}
          style={{ paddingLeft: 8 + indent + depth * 18 }}
          data-type-id={item.id}
          onClick={() => setSelected(item.id)}
          aria-current={item.id === schema?.id ? 'page' : undefined}
          draggable
          onDragStart={event => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.id);
            setDragged(item.id);
          }}
          onDragEnd={endDrag}
          onDragOver={event => {
            if (!dragged) return;
            event.preventDefault();
            setDropFolder(null);
            // La previsualización puede poner la propia fila arrastrada bajo el puntero.
            // Sigue aceptando el drop y conserva el último destino válido.
            if (dragged === item.id) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            // Tercio superior: antes; tercio inferior: después; centro: heredar del destino.
            const rel = (event.clientY - bounds.top) / bounds.height;
            const zone: DropZone = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
            setPreview(current =>
              current && current.targetId === item.id && current.zone === zone ? current : { targetId: item.id, zone },
            );
          }}
          onDrop={event => {
            event.preventDefault();
            if (dragged && preview) {
              dispatch({ type: 'move-schema', id: dragged, targetId: preview.targetId, zone: preview.zone });
              if (preview.zone === 'inside') toggle(preview.targetId, true);
            }
            endDrag();
          }}
        >
          {depth > 0 && (
            <span className="type-guides" aria-hidden>
              {guides[index].map((continues, level) =>
                continues && level > 0 && level < depth ? (
                  <span key={level} className="type-guide" style={{ left: 15 + indent + (level - 1) * 18 }} />
                ) : null,
              )}
              <span
                className={`type-guide ${isLast[index] ? 'end' : ''}`}
                style={{ left: 15 + indent + (depth - 1) * 18 }}
              />
              <span className="type-guide tick" style={{ left: 15 + indent + (depth - 1) * 18 }} />
            </span>
          )}
          {hasChildren ? (
            <button
              type="button"
              className="type-twist"
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Desplegar' : 'Plegar'} los subtipos de ${item.name}`}
              onClick={event => {
                event.stopPropagation();
                toggle(item.id);
              }}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : (
            <span className="type-twist" aria-hidden />
          )}
          <button type="button" className="type-select" onClick={() => setSelected(item.id)}>
            <TypeIcon icon={item.icon} color={item.color} />
            <span className="names">
              <strong>{item.name || 'Sin nombre'}</strong>
              <small>
                {item.isAbstract ? 'Abstracto · ' : ''}
                {item.fields.length} {item.fields.length === 1 ? 'atributo' : 'atributos'}
                {item.fields.some(f => 'ref' in f) ? ' · con preformas' : ''}
                {isCollapsed ? ' · subtipos plegados' : ''}
              </small>
            </span>
          </button>
          <IconButton
            icon={Plus}
            size="sm"
            className="type-add"
            label={`Crear subtipo de ${item.name}`}
            onClick={event => {
              event.stopPropagation();
              openCreateModal(item.id);
            }}
          />
        </div>
      );
    });
  };

  return (
    <main className="schema-layout" style={{ gridTemplateColumns: `${preferences.typeListWidth}px minmax(0, 1fr)` }}>
      <aside className="side-panel left" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }} aria-label="Tipos">
        <div className="panel-head">
          <h2>{isEntity ? 'Tipos' : 'Relaciones'}</h2>
          <div className="spacer" />
          {anyCollapsible && (
            <IconButton
              icon={ChevronsDownUp}
              size="sm"
              label={allCollapsed ? 'Desplegar todo' : 'Plegar todo'}
              onClick={() => setCollapsed(allCollapsed ? [] : [...parents, ...folders.map(f => `folder:${f.id}`)])}
            />
          )}
          <IconButton icon={FolderPlus} size="sm" label="Nueva carpeta" onClick={createFolder} />
          <IconButton icon={Plus} size="sm" label="Crear tipo" onClick={() => openCreateModal()} />
        </div>
        <nav className="type-items" aria-label="Lista de tipos">
          <div
            className={`type-group-title ${dropFolder === 'none' ? 'drop-target' : ''}`}
            onDragOver={event => folderDragOver(event, null)}
            onDragLeave={() => setDropFolder(current => (current === 'none' ? null : current))}
            onDrop={event => folderDrop(event, null)}
            title={folders.length ? 'Suelta aquí un tipo para sacarlo de su carpeta' : undefined}
          >
            {isEntity ? 'Entidades' : 'Relaciones'}
          </div>
          {blocks.map(block => {
            if (!block.folder) return <div key="loose">{renderEntries(block.entries, 0)}</div>;
            const folder = block.folder;
            const open = !collapsed.has(`folder:${folder.id}`);
            const count = block.entries.filter(e => e.depth === 0).length;
            return (
              <div key={folder.id}>
                <div
                  className={`tree-folder type-folder ${dropFolder === folder.id ? 'drop-inside' : ''}`}
                  onClick={() => toggle(`folder:${folder.id}`)}
                  onDragOver={event => folderDragOver(event, folder.id)}
                  onDragLeave={() => setDropFolder(current => (current === folder.id ? null : current))}
                  onDrop={event => folderDrop(event, folder)}
                  title="Carpeta: solo organiza la lista"
                >
                  <button type="button" className="twist" aria-expanded={open} aria-label={`Carpeta ${folder.name}`}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <span className="folder-icon" aria-hidden>
                    {open ? <FolderOpen size={15} /> : <Folder size={15} />}
                  </span>
                  <span className="tree-label">{folder.name}</span>
                  <span className="badge">{count}</span>
                  <span className="row-actions" onClick={event => event.stopPropagation()}>
                    <IconButton
                      icon={Pencil}
                      size="sm"
                      label="Renombrar carpeta"
                      onClick={() => renameFolder(folder)}
                    />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="danger"
                      label="Eliminar carpeta"
                      onClick={() => removeFolder(folder, count)}
                    />
                  </span>
                </div>
                {open &&
                  (block.entries.length ? (
                    renderEntries(block.entries, FOLDER_INDENT)
                  ) : (
                    <p className="muted-note folder-empty">Arrastra aquí un tipo sin herencia.</p>
                  ))}
              </div>
            );
          })}
          <button type="button" className="type-item muted" onClick={() => openCreateModal()}>
            <Plus size={15} aria-hidden style={{ margin: '0 4px' }} />
            <span className="names">
              <small>{isEntity ? 'Nueva entidad' : 'Nueva relación'}</small>
            </span>
          </button>
        </nav>
        <Splitter
          width={preferences.typeListWidth}
          grow="right"
          label="Redimensionar lista de tipos"
          onChange={width => setPreference('typeListWidth', width)}
        />
      </aside>
      {schema ? (
        <fieldset className="access-lock" disabled={!canEditSchema}>
          <SchemaEditor key={schema.id} schema={schema} onDuplicated={setSelected} />
        </fieldset>
      ) : (
        <EmptyState
          icon={isEntity ? Shapes : GitFork}
          title={isEntity ? 'Diseña los elementos de tu proyecto' : 'Define cómo se conectan'}
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCreateModal()}>
              Crear el primer tipo
            </Button>
          }
        >
          {isEntity
            ? `Los tipos de entidad (${words.entities}) definen qué nodos puedes crear.`
            : `Los tipos de relación (${words.relations}) definen cómo se conectan los nodos: con qué tipos, en qué sentido y con qué nombre visto desde cada lado.`}
        </EmptyState>
      )}
      {creating && (
        <Modal
          title={isEntity ? 'Crear tipo de entidad' : 'Crear tipo de relación'}
          submitLabel="Crear tipo"
          submitDisabled={!name.trim()}
          initialFocus={nameInput}
          onClose={() => setCreating(null)}
          onSubmit={createType}
        >
          <div className="form-grid">
            {createParent && <p>Heredará de «{ofKind.find(s => s.id === createParent)?.name}».</p>}
            <label className="field">
              Nombre
              <input
                ref={nameInput}
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={`Por ejemplo: ${creating === 'entity' ? words.entity : words.relation}`}
              />
            </label>
          </div>
        </Modal>
      )}
    </main>
  );
}
