import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { uid } from '../../domain/factories';
import {
  defaultSqlType,
  editDatabaseDesign,
  hasLength,
  hasPrecision,
  hasTimeScale,
  allowsIdentity,
  SQL_TYPES,
  validateDatabaseDesign,
  type DatabaseColumn,
  type DatabaseDesign,
  type DatabaseTable,
  type SqlTypeName,
} from '../../domain/databaseDesign';
import { Button, IconButton } from '../common/Button';
import { Modal } from '../common/Modal';
import type { Project } from '../../domain/types';

export function TableEditor({
  initial,
  project,
  design,
  onSave,
  onClose,
}: {
  initial: DatabaseTable;
  project: Project;
  design: DatabaseDesign;
  onSave: (table: DatabaseTable, typeId?: string) => void;
  onClose: () => void;
}) {
  const [table, setTable] = useState<DatabaseTable>(() => structuredClone(initial));
  const [typeId, setTypeId] = useState('');
  const existingNode = project.nodes.find(n => n.id === initial.id);
  const name = useRef<HTMLInputElement>(null);
  const addedName = useRef<HTMLInputElement>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  useEffect(() => {
    if (!addedId) return;
    addedName.current?.focus();
    addedName.current?.select();
    addedName.current?.scrollIntoView({ block: 'nearest' });
  }, [addedId]);
  const preview = editDatabaseDesign(design, { kind: 'save-table', table });
  const errors = validateDatabaseDesign(preview).filter(i => i.severity === 'error');
  const removedFks = design.foreignKeys.length - preview.foreignKeys.length;
  const updateColumn = (id: string, patch: Partial<DatabaseColumn>) =>
    setTable(current => ({ ...current, columns: current.columns.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
  const addColumn = () => {
    const id = uid('column');
    setTable(current => ({
      ...current,
      columns: [
        ...current.columns,
        { id, name: 'Nueva_columna', type: defaultSqlType('nvarchar'), nullable: true, identity: false },
      ],
    }));
    setAddedId(id);
  };
  const reorder = (id: string, direction: number) =>
    setTable(current => {
      const columns = [...current.columns];
      const i = columns.findIndex(c => c.id === id);
      if (i + direction < 0 || i + direction >= columns.length) return current;
      [columns[i], columns[i + direction]] = [columns[i + direction], columns[i]];
      return { ...current, columns };
    });
  return (
    <Modal
      title={design.tables.some(t => t.id === initial.id) ? 'Editar tabla' : 'Nueva tabla'}
      wide
      initialFocus={name}
      submitDisabled={errors.length > 0}
      onClose={onClose}
      onSubmit={() => onSave(table, typeId || undefined)}
    >
      <div className="db-table-form">
        {!existingNode && (
          <label className="field">
            Tipo del nodo
            <select aria-label="Tipo del nodo de tabla" value={typeId} onChange={e => setTypeId(e.target.value)}>
              <option value="">Tabla (tipo común)</option>
              {project.schemas
                .filter(s => s.kind === 'entity' && !s.isAbstract)
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            <small>Se creará un nodo normal de este tipo, marcado como tabla SQL.</small>
          </label>
        )}
        {existingNode && (
          <p className="field-hint">
            Configuras la estructura SQL de un nodo existente. Sus propiedades y notas se conservan.
          </p>
        )}
        <div className="db-identity">
          <label className="field">
            Esquema SQL
            <input
              aria-label="Esquema SQL"
              value={table.schema}
              maxLength={128}
              onChange={e => setTable({ ...table, schema: e.target.value })}
            />
          </label>
          <label className="field">
            Nombre de tabla
            <input
              ref={name}
              aria-label="Nombre de tabla"
              value={table.name}
              maxLength={128}
              onFocus={e => e.currentTarget.select()}
              onChange={e => setTable({ ...table, name: e.target.value })}
            />
          </label>
        </div>
        <div className="db-section-head">
          <h3>Columnas</h3>
          <Button icon={Plus} size="sm" onClick={addColumn}>
            Añadir columna
          </Button>
        </div>
        <p className="field-hint">
          PK selecciona la clave primaria. En una clave compuesta, el orden es el de selección. IDENTITY genera enteros
          con inicio 1 e incremento 1.
        </p>
        {table.columns.map((column, index) => (
          <fieldset className="db-column-row" key={column.id} data-column-id={column.id}>
            <legend>Columna {index + 1}</legend>
            <label className="field db-column-name">
              Nombre
              <input
                ref={addedId === column.id ? addedName : undefined}
                aria-label={`Nombre de columna ${index + 1}`}
                value={column.name}
                maxLength={128}
                onChange={e => updateColumn(column.id, { name: e.target.value })}
              />
            </label>
            <label className="field">
              Tipo SQL
              <select
                aria-label={`Tipo SQL de ${column.name}`}
                value={column.type.name}
                onChange={e => {
                  const next = e.target.value as SqlTypeName;
                  updateColumn(column.id, {
                    type: defaultSqlType(next),
                    identity: allowsIdentity(next) && column.identity,
                  });
                }}
              >
                {SQL_TYPES.map(type => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            {hasLength(column.type.name) && (
              <label className="field">
                Longitud
                <input
                  aria-label={`Longitud de ${column.name}`}
                  value={column.type.length ?? ''}
                  onChange={e =>
                    updateColumn(column.id, {
                      type: {
                        ...column.type,
                        length: e.target.value.toLowerCase() === 'max' ? 'max' : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            )}
            {hasPrecision(column.type.name) && (
              <label className="field">
                Precisión
                <input
                  type="number"
                  min={1}
                  max={38}
                  aria-label={`Precisión de ${column.name}`}
                  value={column.type.precision ?? ''}
                  onChange={e =>
                    updateColumn(column.id, { type: { ...column.type, precision: Number(e.target.value) } })
                  }
                />
              </label>
            )}
            {(hasPrecision(column.type.name) || hasTimeScale(column.type.name)) && (
              <label className="field">
                Escala
                <input
                  type="number"
                  min={0}
                  max={hasPrecision(column.type.name) ? (column.type.precision ?? 38) : 7}
                  aria-label={`Escala de ${column.name}`}
                  value={column.type.scale ?? ''}
                  onChange={e => updateColumn(column.id, { type: { ...column.type, scale: Number(e.target.value) } })}
                />
              </label>
            )}
            <div className="db-column-checks">
              <label>
                <input
                  type="checkbox"
                  aria-label={`PK de ${column.name}`}
                  checked={table.primaryKey.includes(column.id)}
                  onChange={e =>
                    setTable({
                      ...table,
                      primaryKey: e.target.checked
                        ? [...table.primaryKey, column.id]
                        : table.primaryKey.filter(id => id !== column.id),
                      columns: table.columns.map(c =>
                        c.id === column.id && e.target.checked ? { ...c, nullable: false } : c,
                      ),
                    })
                  }
                />
                PK
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Nullable de ${column.name}`}
                  disabled={table.primaryKey.includes(column.id) || column.identity}
                  checked={column.nullable}
                  onChange={e => updateColumn(column.id, { nullable: e.target.checked })}
                />
                NULL
              </label>
              {allowsIdentity(column.type.name) && (
                <label>
                  <input
                    type="checkbox"
                    aria-label={`IDENTITY de ${column.name}`}
                    checked={column.identity}
                    onChange={e =>
                      updateColumn(column.id, {
                        identity: e.target.checked,
                        nullable: e.target.checked ? false : column.nullable,
                      })
                    }
                  />
                  IDENTITY
                </label>
              )}
            </div>
            <div className="db-column-actions">
              <IconButton
                icon={ArrowUp}
                label={`Subir ${column.name}`}
                disabled={index === 0}
                onClick={() => reorder(column.id, -1)}
              />
              <IconButton
                icon={ArrowDown}
                label={`Bajar ${column.name}`}
                disabled={index === table.columns.length - 1}
                onClick={() => reorder(column.id, 1)}
              />
              <IconButton
                icon={Trash2}
                label={`Quitar columna ${column.name}`}
                onClick={() =>
                  setTable({
                    ...table,
                    columns: table.columns.filter(c => c.id !== column.id),
                    primaryKey: table.primaryKey.includes(column.id) ? [] : table.primaryKey,
                    uniqueKeys: table.uniqueKeys.filter(k => !k.columnIds.includes(column.id)),
                  })
                }
              />
            </div>
          </fieldset>
        ))}
        <p className="field-hint">
          PK: {table.primaryKey.map(id => table.columns.find(c => c.id === id)?.name).join(' → ') || 'Sin definir'}
        </p>
        <div className="db-section-head">
          <h3>Restricciones UNIQUE</h3>
          <Button
            icon={Plus}
            size="sm"
            onClick={() =>
              setTable({
                ...table,
                uniqueKeys: [
                  ...table.uniqueKeys,
                  { id: uid('unique'), name: `UQ_${table.name}_${table.uniqueKeys.length + 1}`, columnIds: [] },
                ],
              })
            }
          >
            Añadir UNIQUE
          </Button>
        </div>
        {table.uniqueKeys.map(key => (
          <fieldset key={key.id} className="db-unique-row">
            <legend>UNIQUE</legend>
            <label className="field">
              Nombre de restricción
              <input
                aria-label="Nombre de UNIQUE"
                value={key.name}
                onChange={e =>
                  setTable({
                    ...table,
                    uniqueKeys: table.uniqueKeys.map(k => (k.id === key.id ? { ...k, name: e.target.value } : k)),
                  })
                }
              />
            </label>
            <div className="db-key-columns">
              {table.columns.map(c => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    aria-label={`UNIQUE ${key.name}: ${c.name}`}
                    checked={key.columnIds.includes(c.id)}
                    onChange={e =>
                      setTable({
                        ...table,
                        uniqueKeys: table.uniqueKeys.map(k =>
                          k.id === key.id
                            ? {
                                ...k,
                                columnIds: e.target.checked
                                  ? [...k.columnIds, c.id]
                                  : k.columnIds.filter(id => id !== c.id),
                              }
                            : k,
                        ),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <small>
              Orden:{' '}
              {key.columnIds.map(id => table.columns.find(c => c.id === id)?.name).join(' → ') || 'Selecciona columnas'}
            </small>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setTable({ ...table, uniqueKeys: table.uniqueKeys.filter(k => k.id !== key.id) })}
            >
              Quitar UNIQUE
            </Button>
          </fieldset>
        ))}
        {removedFks > 0 && (
          <p className="db-warning" role="status">
            Al guardar se retirarán {removedFks} claves foráneas que usan las columnas eliminadas. Podrás deshacer el
            conjunto.
          </p>
        )}
        {errors.length > 0 && (
          <ul className="db-errors" role="alert">
            {errors.map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
