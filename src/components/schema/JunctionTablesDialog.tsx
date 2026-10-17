import { useMemo, useState } from 'react';
import { junctionProposals, type JunctionProposal } from '../../domain/junctionTables';
import { allFields, nodeLabel } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/**
 * Propuesta de tablas intermedias para las referencias múltiples de un tipo tabla (hito 4 de los
 * diagramas de bases de datos). Enseña cada tabla con sus dos claves foráneas, deja cambiar los nombres
 * y elegir cuáles crear; se crean en un solo paso deshacible.
 */
export function JunctionTablesDialog({ typeId, onClose }: { typeId: string; onClose: () => void }) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const proposals = useMemo(() => junctionProposals(project, { typeId }), [project, typeId]);
  const [names, setNames] = useState(() => proposals.map(p => p.name));
  const [chosen, setChosen] = useState(() => proposals.map(() => true));
  const [removeReference, setRemoveReference] = useState(true);
  const label = (id: string) => {
    const node = project.nodes.find(n => n.id === id);
    return node ? nodeLabel(project, node) : '';
  };
  const fieldLabel = (proposal: JunctionProposal) =>
    allFields(project, project.nodes.find(n => n.id === proposal.sourceId)?.typeId ?? '').find(
      f => f.id === proposal.fieldId,
    )?.label ?? '';
  const accepted = proposals
    .map((proposal, i) => ({ ...proposal, name: names[i] ?? proposal.name }))
    .filter((proposal, i) => chosen[i] && proposal.name.trim());

  return (
    <Modal
      title="Tablas intermedias"
      submitLabel={accepted.length === 1 ? 'Crear la tabla' : `Crear ${accepted.length} tablas`}
      submitDisabled={!accepted.length}
      wide
      onClose={onClose}
      onSubmit={() => {
        dispatch({ type: 'create-junction-tables', proposals: accepted, removeReference });
        toast({
          message: `${accepted.length === 1 ? 'Creada 1 tabla intermedia' : `Creadas ${accepted.length} tablas intermedias`}.`,
          undoable: true,
        });
        onClose();
      }}
    >
      <p className="muted-note">
        Una referencia múltiple entre tablas es una relación muchos a muchos: en una base de datos se guarda en una
        tabla intermedia, con una clave foránea a cada tabla que juntas forman su clave primaria. Revisa los nombres y
        elige cuáles crear. Si la relación necesita más datos (fecha, cantidad…), añádelos después como columnas.
      </p>
      {proposals.length === 0 ? (
        <p className="muted-note">Este tipo no tiene referencias múltiples hacia otras tablas.</p>
      ) : (
        <ul className="junction-list">
          {proposals.map((proposal, i) => (
            <li key={`${proposal.sourceId}-${proposal.fieldId}-${proposal.targetId}`}>
              <label className="junction-pick">
                <input
                  type="checkbox"
                  checked={chosen[i]}
                  onChange={e => setChosen(current => current.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span>
                  {label(proposal.sourceId)} · {fieldLabel(proposal)} → {label(proposal.targetId)}
                </span>
              </label>
              <input
                aria-label="Nombre de la tabla intermedia"
                value={names[i] ?? ''}
                disabled={!chosen[i]}
                onChange={e => setNames(current => current.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <small className="field-hint">
                Columnas: Id {label(proposal.sourceId)} (FK, PK) · Id {label(proposal.targetId)} (FK, PK)
              </small>
            </li>
          ))}
        </ul>
      )}
      <label className="junction-pick">
        <input type="checkbox" checked={removeReference} onChange={e => setRemoveReference(e.target.checked)} />
        <span>Quitar de la referencia múltiple las tablas que pasan a la tabla intermedia</span>
      </label>
    </Modal>
  );
}
