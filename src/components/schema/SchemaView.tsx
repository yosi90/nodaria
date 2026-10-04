import { GitFork, Plus, Shapes } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../../domain/factories';
import { schemaTree } from '../../domain/inheritance';
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
  const [name, setName] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const schema = ofKind.find(item => item.id === selected) ?? ofKind[0];

  const openCreateModal = () => {
    setName('');
    setCreating(kind);
  };

  const createType = () => {
    const cleanName = name.trim();
    if (!cleanName || !creating) return;
    const id = uid('type');
    dispatch({ type: 'add-schema', name: cleanName, kind: creating, id });
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
            const items = schemaTree(project, group.kind);
            return (
              <div key={group.kind}>
                <div className="type-group-title">{group.title}</div>
                {items.map(({ schema: item, depth }) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`type-item ${item.id === schema?.id ? 'active' : ''} ${dragged === item.id ? 'dragging' : ''}`}
                    style={{ paddingLeft: 8 + depth * 18 }}
                    data-type-id={item.id}
                    aria-current={item.id === schema?.id ? 'page' : undefined}
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.effectAllowed = 'move';
                      setDragged(item.id);
                    }}
                    onDragEnd={() => setDragged(null)}
                    onDragOver={event => {
                      if (dragged && dragged !== item.id) event.preventDefault();
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      if (!dragged || dragged === item.id) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      dispatch({
                        type: 'reorder-schema',
                        id: dragged,
                        targetId: item.id,
                        after: event.clientY > bounds.top + bounds.height / 2,
                      });
                      setDragged(null);
                    }}
                    onClick={() => setSelected(item.id)}
                  >
                    {depth > 0 && <span className="type-branch" aria-hidden />}
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
                ))}
                <button type="button" className="type-item muted" onClick={openCreateModal}>
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
          title={isEntity ? 'Diseña las piezas de tu mundo' : 'Define cómo se conectan'}
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCreateModal()}>
              Crear el primer tipo
            </Button>
          }
        >
          {isEntity
            ? 'Los tipos de entidad (Personaje, Lugar, Deidad…) definen qué nodos puedes crear.'
            : 'Los tipos de relación (Parentesco, Alianza, Culto…) definen cómo se conectan los nodos: con qué tipos, en qué sentido y con qué nombre visto desde cada lado.'}
        </EmptyState>
      )}
      {creating && (
        <Modal
          title={isEntity ? 'Crear tipo de entidad' : 'Crear tipo de relación'}
          submitLabel="Crear tipo"
          submitDisabled={!name.trim()}
          onClose={() => setCreating(null)}
          onSubmit={createType}
        >
          <div className="form-grid">
            <label className="field">
              Nombre
              <input
                autoFocus
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={creating === 'entity' ? 'Por ejemplo: Personaje' : 'Por ejemplo: Venera a'}
              />
            </label>
          </div>
        </Modal>
      )}
    </main>
  );
}
