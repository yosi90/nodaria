import { useState } from 'react';
import { nodeLabel, typeMatches } from '../../domain/selectors';
import type { Project, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';

interface CreateRelationModalProps {
  initialSourceId: string;
  onClose: () => void;
}

export function CreateRelationModal({ initialSourceId, onClose }: CreateRelationModalProps) {
  const { project, dispatch } = useApp();
  const relationSchemas = project.schemas.filter(schema => schema.kind === 'relationship');
  const initialSchema =
    relationSchemas.find(schema => {
      const source = project.nodes.find(node => node.id === initialSourceId);
      return source && typeMatches(project, source.typeId, schema.sourceTypeIds);
    }) ?? relationSchemas[0];
  const [schemaId, setSchemaId] = useState(initialSchema?.id ?? '');
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState('');
  const schema = relationSchemas.find(item => item.id === schemaId);
  const sourceNodes = compatibleNodes(project, schema, 'sourceTypeIds');
  const validSourceId = sourceNodes.some(node => node.id === sourceId) ? sourceId : (sourceNodes[0]?.id ?? '');
  const targetNodes = compatibleNodes(project, schema, 'targetTypeIds').filter(node => node.id !== validSourceId);
  const validTargetId = targetNodes.some(node => node.id === targetId) ? targetId : (targetNodes[0]?.id ?? '');
  const canCreate = Boolean(schema && validSourceId && validTargetId);

  const changeSchema = (nextSchemaId: string) => {
    setSchemaId(nextSchemaId);
    setSourceId('');
    setTargetId('');
  };

  const create = () => {
    if (!schema || !validSourceId || !validTargetId) return;
    dispatch({ type: 'add-relation', typeId: schema.id, sourceId: validSourceId, targetId: validTargetId });
    onClose();
  };

  return (
    <Modal
      title="Crear relación"
      submitLabel="Crear relación"
      submitDisabled={!canCreate}
      onSubmit={create}
      onClose={onClose}
    >
      {relationSchemas.length ? (
        <div className="form-grid">
          <label className="field">
            Tipo de relación
            <select value={schemaId} onChange={event => changeSchema(event.target.value)}>
              {relationSchemas.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              Nodo de origen
              <select
                value={validSourceId}
                onChange={event => {
                  setSourceId(event.target.value);
                  setTargetId('');
                }}
              >
                {sourceNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {nodeLabel(project, node)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Nodo de destino
              <select value={validTargetId} onChange={event => setTargetId(event.target.value)}>
                {targetNodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {nodeLabel(project, node)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!targetNodes.length && (
            <p className="validation-message">
              No hay otro nodo compatible que pueda usarse como destino para este tipo de relación.
            </p>
          )}
        </div>
      ) : (
        <p className="validation-message">Primero crea un tipo de relación en “Tipos y propiedades”.</p>
      )}
    </Modal>
  );
}

function compatibleNodes(project: Project, schema: Schema | undefined, key: 'sourceTypeIds' | 'targetTypeIds') {
  if (!schema) return [];
  return project.nodes.filter(node => typeMatches(project, node.typeId, schema[key]));
}
