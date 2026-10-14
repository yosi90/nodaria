import { GitFork, Plus, Shapes } from 'lucide-react';
import { useRef, useState } from 'react';
import { uid } from '../../domain/factories';
import { moveSchema, schemaTree, type DropZone } from '../../domain/inheritance';
import type { SchemaKind } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { usePreferences } from '../../state/preferences';
import { Button, IconButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';
import { Modal } from '../common/Modal';
import { Splitter } from '../common/Splitter';
import { SchemaEditor } from './SchemaEditor';

export function SchemaView({ kind }: { kind: SchemaKind }) {
  const { project, dispatch } = useApp();
  const isEntity = kind === 'entity';
  const { preferences, setPreference } = usePreferences();
  const ofKind = project.schemas.filter(s => s.kind === kind);
  const [selected, setSelected] = useState<string | null>(ofKind[0]?.id || null);
  const [creating, setCreating] = useState<SchemaKind | null>(null);
  const [createParent, setCreateParent] = useState<string | null>(null);
  const [name, setName] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ targetId: string; zone: DropZone } | null>(null);
  // Durante el arrastre la lista se enseña ya reordenada (o anidada); al soltar se confirma.
  const shown = dragged && preview ? moveSchema(project, dragged, preview.targetId, preview.zone) : project;
  const dropInside = dragged && preview?.zone === 'inside' ? preview.targetId : null;
  const schema = ofKind.find(item => item.id === selected) ?? ofKind[0];

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
    setCreating(null);
    setSelected(id);
  };

  const groups: { kind: SchemaKind; title: string }[] = [{ kind, title: isEntity ? 'Entidades' : 'Relaciones' }];

  return (
    <main className="schema-layout" style={{ gridTemplateColumns: `${preferences.typeListWidth}px minmax(0, 1fr)` }}>
      <aside className="side-panel left" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }} aria-label="Tipos">
        <div className="panel-head">
          <h2>{isEntity ? 'Tipos' : 'Relaciones'}</h2>
          <div className="spacer" />
          <IconButton icon={Plus} size="sm" label="Crear tipo" onClick={() => openCreateModal()} />
        </div>
        <nav className="type-items" aria-label="Lista de tipos">
          {groups.map(group => {
            const items = schemaTree(shown, group.kind);
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
            return (
              <div key={group.kind}>
                <div className="type-group-title">{group.title}</div>
                {items.map(({ schema: item, depth }, index) => (
                  <div
                    key={item.id}
                    className={`type-item ${item.id === schema?.id ? 'active' : ''} ${dragged === item.id ? 'dragging' : ''} ${dropInside === item.id ? 'drop-inside' : ''}`}
                    style={{ paddingLeft: 8 + depth * 18 }}
                    data-type-id={item.id}
                    onClick={() => setSelected(item.id)}
                    aria-current={item.id === schema?.id ? 'page' : undefined}
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.id);
                      setDragged(item.id);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setPreview(null);
                    }}
                    onDragOver={event => {
                      if (!dragged) return;
                      event.preventDefault();
                      // La previsualización puede poner la propia fila arrastrada bajo el puntero.
                      // Sigue aceptando el drop y conserva el último destino válido.
                      if (dragged === item.id) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      // Tercio superior: antes; tercio inferior: después; centro: heredar del destino.
                      const rel = (event.clientY - bounds.top) / bounds.height;
                      const zone: DropZone = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
                      setPreview(current =>
                        current && current.targetId === item.id && current.zone === zone
                          ? current
                          : { targetId: item.id, zone },
                      );
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      if (dragged && preview) {
                        dispatch({ type: 'move-schema', id: dragged, targetId: preview.targetId, zone: preview.zone });
                      }
                      setDragged(null);
                      setPreview(null);
                    }}
                  >
                    {depth > 0 && (
                      <span className="type-guides" aria-hidden>
                        {guides[index].map((continues, level) =>
                          continues && level > 0 && level < depth ? (
                            <span key={level} className="type-guide" style={{ left: 15 + (level - 1) * 18 }} />
                          ) : null,
                        )}
                        <span
                          className={`type-guide ${isLast[index] ? 'end' : ''}`}
                          style={{ left: 15 + (depth - 1) * 18 }}
                        />
                        <span className="type-guide tick" style={{ left: 15 + (depth - 1) * 18 }} />
                      </span>
                    )}
                    <button type="button" className="type-select" onClick={() => setSelected(item.id)}>
                      <TypeIcon icon={item.icon} color={item.color} />
                      <span className="names">
                        <strong>{item.name || 'Sin nombre'}</strong>
                        <small>
                          {item.isAbstract ? 'Abstracto · ' : ''}
                          {item.fields.length} {item.fields.length === 1 ? 'atributo' : 'atributos'}
                          {item.fields.some(f => 'ref' in f) ? ' · con preformas' : ''}
                        </small>
                      </span>
                    </button>
                    <IconButton
                      icon={Plus}
                      size="sm"
                      label={`Crear subtipo de ${item.name}`}
                      onClick={event => {
                        event.stopPropagation();
                        openCreateModal(item.id);
                      }}
                    />
                  </div>
                ))}
                <button type="button" className="type-item muted" onClick={() => openCreateModal()}>
                  <Plus size={15} aria-hidden style={{ margin: '0 4px' }} />
                  <span className="names">
                    <small>{group.kind === 'entity' ? 'Nueva entidad' : 'Nueva relación'}</small>
                  </span>
                </button>
              </div>
            );
          })}
        </nav>
        <Splitter
          width={preferences.typeListWidth}
          grow="right"
          label="Redimensionar lista de tipos"
          onChange={width => setPreference('typeListWidth', width)}
        />
      </aside>
      {schema ? (
        <SchemaEditor key={schema.id} schema={schema} onDuplicated={setSelected} />
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
            ? 'Los tipos de entidad (Persona, Producto, Actividad…) definen qué nodos puedes crear.'
            : 'Los tipos de relación (Trabaja en, Depende de, Participa en…) definen cómo se conectan los nodos: con qué tipos, en qué sentido y con qué nombre visto desde cada lado.'}
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
                placeholder={creating === 'entity' ? 'Por ejemplo: Persona' : 'Por ejemplo: Trabaja en'}
              />
            </label>
          </div>
        </Modal>
      )}
    </main>
  );
}
