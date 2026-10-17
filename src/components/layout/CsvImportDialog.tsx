import { useMemo, useState } from 'react';
import { guessMapping, importCsvRows, type ColumnTarget, type CsvTable } from '../../domain/csvImport';
import { allFields } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

const encode = (target: ColumnTarget) =>
  target ? (target.kind === 'field' ? `field:${target.fieldId}` : target.kind) : '';
const skippedText = (n: number) =>
  n === 1
    ? '1 valor no encaja en su atributo y quedará vacío'
    : `${n} valores no encajan en su atributo y quedarán vacíos`;
const unplacedText = (n: number) =>
  n === 1
    ? '1 fila irá a la raíz porque su «Dentro de» no existe o no lo admite'
    : `${n} filas irán a la raíz porque su «Dentro de» no existe o no lo admite`;
const decode = (value: string): ColumnTarget =>
  !value
    ? null
    : value.startsWith('field:')
      ? { kind: 'field', fieldId: value.slice(6) }
      : ({ kind: value } as ColumnTarget);

/**
 * Importar nodos desde un CSV (PENDIENTES.md, Fase 7): se elige el tipo y a qué va cada columna (se
 * propone por su nombre) y se crean en un solo paso deshacible. Lee los CSV que exporta Nodaria.
 */
export function CsvImportDialog({
  fileName,
  table,
  onClose,
}: {
  fileName: string;
  table: CsvTable;
  onClose: () => void;
}) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const types = project.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  // El tipo cuyo nombre es el del archivo («Persona.csv»), o el primero.
  const [typeId, setTypeId] = useState(
    () => types.find(t => fileName.toLowerCase().startsWith(t.name.toLowerCase()))?.id ?? types[0]?.id ?? '',
  );
  const [mapping, setMapping] = useState<ColumnTarget[]>(() =>
    typeId ? guessMapping(project, typeId, table.header) : [],
  );
  const fields = useMemo(
    () => (typeId ? allFields(project, typeId).filter(f => !f.isTitle && f.type !== 'computed') : []),
    [project, typeId],
  );
  const preview = useMemo(
    () => (typeId ? importCsvRows(project, typeId, table, mapping) : null),
    [project, typeId, table, mapping],
  );
  const hasTitle = mapping.some(m => m?.kind === 'title');

  return (
    <Modal
      title={`Importar «${fileName}»`}
      submitLabel={preview?.created === 1 ? 'Crear 1 nodo' : `Crear ${preview?.created ?? 0} nodos`}
      submitDisabled={!preview?.created || !hasTitle}
      wide
      onClose={onClose}
      onSubmit={() => {
        dispatch({ type: 'import-csv-rows', typeId, table, mapping });
        toast({
          message: `${preview!.created === 1 ? 'Creado 1 nodo' : `Creados ${preview!.created} nodos`}.`,
          undoable: true,
        });
        onClose();
      }}
    >
      {!types.length ? (
        <p className="muted-note">Crea antes un tipo de entidad: cada fila del CSV será un nodo de ese tipo.</p>
      ) : (
        <div className="form-grid">
          <label className="field">
            Cada fila es un nodo de tipo
            <select
              value={typeId}
              onChange={e => {
                setTypeId(e.target.value);
                setMapping(guessMapping(project, e.target.value, table.header));
              }}
            >
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="csv-mapping">
            {table.header.map((column, i) => (
              <label key={`${column}-${i}`} className="field">
                <span>
                  {column || `Columna ${i + 1}`}{' '}
                  <small className="field-hint">
                    {table.rows[0]?.[i] ? `p. ej. «${table.rows[0][i].slice(0, 40)}»` : ''}
                  </small>
                </span>
                <select
                  value={encode(mapping[i] ?? null)}
                  onChange={e =>
                    setMapping(current =>
                      table.header.map((_, j) => (j === i ? decode(e.target.value) : (current[j] ?? null))),
                    )
                  }
                >
                  <option value="">No importar</option>
                  <option value="title">Título del nodo</option>
                  <option value="parent">Dentro de (por título)</option>
                  <option value="notes">Notas</option>
                  {fields.map(f => (
                    <option key={f.id} value={`field:${f.id}`}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="muted-note">
            {!hasTitle
              ? 'Elige qué columna es el título del nodo.'
              : [
                  preview?.created === 1 ? '1 fila con título' : `${preview?.created ?? 0} filas con título`,
                  preview?.skipped ? skippedText(preview.skipped) : '',
                  preview?.unplaced ? unplacedText(preview.unplaced) : '',
                ]
                  .filter(Boolean)
                  .join('; ') + '.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
