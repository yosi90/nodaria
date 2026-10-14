import { useRef, useState } from 'react';
import {
  candidateKeys,
  editDatabaseDesign,
  tableName,
  validateDatabaseDesign,
  type DatabaseDesign,
  type DatabaseForeignKey,
} from '../../domain/databaseDesign';
import { Modal } from '../common/Modal';

export function ForeignKeyEditor({
  initial,
  design,
  onSave,
  onClose,
}: {
  initial: DatabaseForeignKey;
  design: DatabaseDesign;
  onSave: (fk: DatabaseForeignKey) => void;
  onClose: () => void;
}) {
  const [fk, setFk] = useState(() => structuredClone(initial));
  const name = useRef<HTMLInputElement>(null);
  const source = design.tables.find(t => t.id === fk.sourceTableId);
  const target = design.tables.find(t => t.id === fk.targetTableId);
  const keys = target ? candidateKeys(target) : [];
  const errors = validateDatabaseDesign(editDatabaseDesign(design, { kind: 'save-fk', foreignKey: fk })).filter(
    i => i.severity === 'error',
  );
  return (
    <Modal
      title="Clave foránea"
      initialFocus={name}
      onClose={onClose}
      submitDisabled={errors.length > 0}
      onSubmit={() => onSave(fk)}
    >
      <div className="form-grid">
        <label className="field">
          Nombre de FK
          <input
            ref={name}
            aria-label="Nombre de FK"
            value={fk.name}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setFk({ ...fk, name: e.target.value })}
          />
        </label>
        <label className="field">
          Tabla de origen
          <select
            aria-label="Tabla de origen"
            value={fk.sourceTableId}
            onChange={e =>
              setFk({ ...fk, sourceTableId: e.target.value, sourceColumnIds: fk.targetColumnIds.map(() => '') })
            }
          >
            <option value="">Elegir tabla</option>
            {design.tables.map(t => (
              <option value={t.id} key={t.id}>
                {tableName(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Tabla referenciada
          <select
            aria-label="Tabla referenciada"
            value={fk.targetTableId}
            onChange={e => setFk({ ...fk, targetTableId: e.target.value, targetColumnIds: [], sourceColumnIds: [] })}
          >
            <option value="">Elegir tabla</option>
            {design.tables.map(t => (
              <option value={t.id} key={t.id}>
                {tableName(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Clave de destino
          <select
            aria-label="Clave de destino"
            value={JSON.stringify(fk.targetColumnIds)}
            onChange={e => {
              const ids = JSON.parse(e.target.value) as string[];
              setFk({ ...fk, targetColumnIds: ids, sourceColumnIds: ids.map((_, i) => fk.sourceColumnIds[i] ?? '') });
            }}
          >
            <option value="[]">Elegir PK o UNIQUE</option>
            {keys.map((ids, i) => (
              <option key={i} value={JSON.stringify(ids)}>
                {target?.primaryKey === ids ? 'PK' : 'UNIQUE'} ·{' '}
                {ids.map(id => target?.columns.find(c => c.id === id)?.name).join(', ')}
              </option>
            ))}
          </select>
        </label>
        {target && !keys.length && (
          <p className="field-hint">Define primero una PK o una restricción UNIQUE en la tabla referenciada.</p>
        )}
        {fk.targetColumnIds.map((targetId, i) => (
          <label className="field" key={targetId}>
            Columna de origen → {target?.columns.find(c => c.id === targetId)?.name}
            <select
              aria-label={`Columna de origen ${i + 1}`}
              value={fk.sourceColumnIds[i] ?? ''}
              onChange={e =>
                setFk({
                  ...fk,
                  sourceColumnIds: fk.targetColumnIds.map((_, j) =>
                    j === i ? e.target.value : (fk.sourceColumnIds[j] ?? ''),
                  ),
                })
              }
            >
              <option value="">Elegir columna</option>
              {source?.columns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.type.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <p className="field-hint">
          Cada columna apunta a una columna de la clave elegida. Las FK compuestas se guardan como una sola restricción.
          Acciones referenciales: NO ACTION.
        </p>
        {errors.length > 0 && (
          <ul role="alert" className="db-errors">
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
