import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';
import { SchemaEditor } from './SchemaEditor';

export function SchemaView() {
  const { project, dispatch } = useApp();
  const [selected, setSelected] = useState<string | null>(project.schemas[0]?.id || null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const schema = project.schemas.find(item => item.id === selected);

  const openCreateModal = () => {
    setName('');
    setCreating(true);
  };

  const createType = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    dispatch({ type: 'add-schema', name: cleanName, kind: 'entity' });
    setCreating(false);
  };

  return (
    <main className="schema-layout">
      <aside className="type-list">
        <div className="panel-head">
          <h2>Tipos</h2>
          <div className="spacer" />
          <button className="icon-btn" aria-label="Crear tipo" onClick={openCreateModal}>
            ＋
          </button>
        </div>
        <div className="type-items">
          {project.schemas.map(item => (
            <button
              key={item.id}
              className={`type-item ${item.id === selected ? 'active' : ''}`}
              onClick={() => setSelected(item.id)}
            >
              <span className="type-dot" style={{ background: item.color }} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.kind === 'entity' ? (item.isAbstract ? 'Entidad abstracta' : 'Entidad') : 'Relación'}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      {schema ? (
        <SchemaEditor schema={schema} />
      ) : (
        <section className="empty-state">
          <div>
            <h2>Diseña tus propios nodos</h2>
            <p>Crea entidades y relaciones para dar estructura al mapa.</p>
            <button className="btn primary" onClick={openCreateModal}>
              Crear el primer tipo
            </button>
          </div>
        </section>
      )}
      {creating && (
        <Modal
          title="Crear nuevo tipo"
          submitLabel="Crear tipo"
          onClose={() => setCreating(false)}
          onSubmit={createType}
        >
          <label className="field">
            Nombre del tipo
            <input
              autoFocus
              required
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Por ejemplo: Personaje"
            />
          </label>
        </Modal>
      )}
    </main>
  );
}
