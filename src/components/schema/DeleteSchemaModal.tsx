import { useState } from 'react';
import { descendants, getSchema, schemaUsage } from '../../domain/selectors';
import type { OrphanStrategy, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';

export function DeleteSchemaModal({ schema, onClose }: { schema: Schema; onClose: () => void }) {
  const { project, dispatch } = useApp();
  const [strategy, setStrategy] = useState<OrphanStrategy>('lift');
  const usage = schemaUsage(project, schema.id);
  const ownNodes = new Set(project.nodes.filter(n => n.typeId === schema.id).map(n => n.id));
  const foreignChildren = project.nodes.filter(n => n.parentId && ownNodes.has(n.parentId) && !ownNodes.has(n.id));
  const nestedCount = new Set(
    [...ownNodes].flatMap(id => [...descendants(project, id)]).filter(id => !ownNodes.has(id)),
  ).size;
  const parentName = schema.parentTypeId ? getSchema(project, schema.parentTypeId)?.name : undefined;

  const confirmDelete = () => {
    dispatch({ type: 'delete-schema', id: schema.id, strategy });
    onClose();
  };

  return (
    <Modal title={`Eliminar “${schema.name}”`} submitLabel="Eliminar tipo" onSubmit={confirmDelete} onClose={onClose}>
      <div className="form-grid">
        <ul className="impact-list">
          <li>
            {usage.nodes} {usage.nodes === 1 ? 'nodo' : 'nodos'} de este tipo
          </li>
          {schema.kind === 'relationship' && (
            <li>
              {usage.relations} {usage.relations === 1 ? 'relación' : 'relaciones'} de este tipo
            </li>
          )}
          {usage.subtypes > 0 && (
            <li>
              {usage.subtypes} {usage.subtypes === 1 ? 'subtipo pasará' : 'subtipos pasarán'} a heredar de{' '}
              {parentName ? `“${parentName}”` : 'ningún tipo'} y perderán los atributos de este
            </li>
          )}
        </ul>
        {foreignChildren.length > 0 && (
          <fieldset className="choice-group">
            <legend>
              {nestedCount === 1
                ? 'Estos nodos contienen 1 subnodo de otro tipo.'
                : `Estos nodos contienen ${nestedCount} subnodos de otros tipos.`}{' '}
              ¿Qué hacemos con ellos?
            </legend>
            <label>
              <input type="radio" checked={strategy === 'lift'} onChange={() => setStrategy('lift')} /> Conservarlos y
              subirlos un nivel
            </label>
            <label>
              <input type="radio" checked={strategy === 'cascade'} onChange={() => setStrategy('cascade')} />{' '}
              Eliminarlos también
            </label>
          </fieldset>
        )}
        <p className="muted-note">Puedes deshacer el borrado con Ctrl+Z.</p>
      </div>
    </Modal>
  );
}
