import { Plus, Shapes } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../../domain/factories';
import type { SchemaKind } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { usePreferences } from '../../state/preferences';
import { Button, IconButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';
import { Modal } from '../common/Modal';
import { Splitter } from '../common/Splitter';
import { SchemaEditor } from './SchemaEditor';

export function SchemaView() {
  const { project, dispatch } = useApp();
  const { preferences, setPreference } = usePreferences();
  const [selected, setSelected] = useState<string | null>(project.schemas[0]?.id || null);
  const [creating, setCreating] = useState<SchemaKind | null>(null);
  const [name, setName] = useState('');
  const schema = project.schemas.find(item => item.id === selected) ?? project.schemas[0];

  const openCreateModal = (kind: SchemaKind = 'entity') => {
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

  const groups: { kind: SchemaKind; title: string }[] = [
    { kind: 'entity', title: 'Entidades' },
    { kind: 'relationship', title: 'Relaciones' },
  ];

  return (
    <main className="schema-layout" style={{ gridTemplateColumns: `${preferences.typeListWidth}px minmax(0, 1fr)` }}>
      <aside className="side-panel left" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }} aria-label="Tipos">
        <div className="panel-head">
          <h2>Tipos</h2>
          <div className="spacer" />
          <IconButton icon={Plus} size="sm" label="Crear tipo" onClick={() => openCreateModal()} />
        </div>
        <nav className="type-items" aria-label="Lista de tipos">
          {groups.map(group => {
            const items = project.schemas.filter(s => s.kind === group.kind);
            return (
              <div key={group.kind}>
                <div className="type-group-title">{group.title}</div>
                {items.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={`type-item ${item.id === schema?.id ? 'active' : ''}`}
                    aria-current={item.id === schema?.id ? 'page' : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    <TypeIcon icon={item.icon} color={item.color} />
                    <span className="names">
                      <strong>{item.name || 'Sin nombre'}</strong>
                      <small>
                        {item.isAbstract ? 'Abstracto · ' : ''}
                        {item.fields.length} {item.fields.length === 1 ? 'atributo' : 'atributos'}
                      </small>
                    </span>
                  </button>
                ))}
                <button type="button" className="type-item muted" onClick={() => openCreateModal(group.kind)}>
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
        <SchemaEditor key={schema.id} schema={schema} />
      ) : (
        <EmptyState
          icon={Shapes}
          title="Diseña las piezas de tu mundo"
          action={
            <Button variant="primary" icon={Plus} onClick={() => openCreateModal()}>
              Crear el primer tipo
            </Button>
          }
        >
          Los tipos de entidad (Personaje, Lugar, Deidad…) definen qué nodos puedes crear. Los tipos de relación
          (Familia, Alianza, Culto…) definen cómo se conectan.
        </EmptyState>
      )}
      {creating && (
        <Modal
          title="Crear nuevo tipo"
          submitLabel="Crear tipo"
          submitDisabled={!name.trim()}
          onClose={() => setCreating(null)}
          onSubmit={createType}
        >
          <div className="form-grid">
            <div className="field">
              Clase
              <div className="segmented" role="group" aria-label="Clase de tipo">
                <button type="button" aria-pressed={creating === 'entity'} onClick={() => setCreating('entity')}>
                  Entidad
                </button>
                <button
                  type="button"
                  aria-pressed={creating === 'relationship'}
                  onClick={() => setCreating('relationship')}
                >
                  Relación
                </button>
              </div>
              <small>
                {creating === 'entity'
                  ? 'Algo que existe en tu mundo y aparece como nodo.'
                  : 'Una forma de conectar dos nodos.'}
              </small>
            </div>
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
