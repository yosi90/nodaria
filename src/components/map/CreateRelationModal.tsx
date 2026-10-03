import { useState } from 'react';
import { typeMatches } from '../../domain/selectors';
import type { Project, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';
import { nodeOption, schemaOption } from '../common/options';
import { Select } from '../common/Select';

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
  const validTargetId = targetNodes.some(node => node.id === targetId) ? targetId : '';
  const canCreate = Boolean(schema && validSourceId && validTargetId);

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
          <div className="field">
            Tipo de relación
            <Select
              aria-label="Tipo de relación"
              options={relationSchemas.map(item => schemaOption(item))}
              value={schemaId}
              onChange={next => {
                setSchemaId(next ?? '');
                setTargetId('');
              }}
            />
          </div>
          <div className="field">
            Desde
            <Select
              aria-label="Nodo de origen"
              options={sourceNodes.map(node => nodeOption(project, node))}
              value={validSourceId || null}
              placeholder="No hay nodos compatibles"
              onChange={next => {
                setSourceId(next ?? '');
                setTargetId('');
              }}
            />
          </div>
          <div className="field">
            Hacia
            <Select
              aria-label="Nodo de destino"
              options={targetNodes.map(node => nodeOption(project, node))}
              value={validTargetId || null}
              placeholder="Elige el nodo de destino…"
              onChange={next => setTargetId(next ?? '')}
            />
          </div>
          {!targetNodes.length && (
            <p className="validation-message">
              No hay otro nodo compatible que pueda usarse como destino para este tipo de relación.
            </p>
          )}
        </div>
      ) : (
        <p className="validation-message">Primero crea un tipo de relación en «Tipos y propiedades».</p>
      )}
    </Modal>
  );
}

function compatibleNodes(project: Project, schema: Schema | undefined, key: 'sourceTypeIds' | 'targetTypeIds') {
  if (!schema) return [];
  return project.nodes.filter(node => typeMatches(project, node.typeId, schema[key]));
}
