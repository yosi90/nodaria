import { useEffect, useState } from 'react';
import type { SqlDialect } from '../../domain/database';
import { nodeLabel } from '../../domain/selectors';
import { convertToTables, documentCollections, suggestTables } from '../../domain/tableConversion';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';
import { OPEN_TABLE_CONVERSION_EVENT } from './openTableConversion';

/** Monta el diálogo cuando lo pide el menú del proyecto o la paleta. */
export function TableConversionHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_TABLE_CONVERSION_EVENT, show);
    return () => window.removeEventListener(OPEN_TABLE_CONVERSION_EVENT, show);
  }, []);
  return open ? <TableConversionDialog onClose={() => setOpen(false)} /> : null;
}

/**
 * Pasar documentos a tablas (`tableConversion.ts`): se eligen la base y las colecciones, y para cada
 * subdocumento si se aplana en columnas del padre o pasa a ser una tabla, con lo que se sugiere y por qué.
 * Por defecto se hace en una copia del proyecto.
 */
export function TableConversionDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { canEditSchema } = useProjectAccess();
  const toast = useToast();
  const collections = documentCollections(project);
  const [dialect, setDialect] = useState<SqlDialect>('sqlserver');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [flatten, setFlatten] = useState<Record<string, boolean>>({});
  const [junctions, setJunctions] = useState(true);
  const [copy, setCopy] = useState(true);
  const nodeIds = collections.filter(n => !unchecked.has(n.id)).map(n => n.id);
  const subdocuments = suggestTables(project, nodeIds);
  const choices = { nodeIds, flatten, junctions };
  const preview = convertToTables(project, dialect, choices);
  const engineName = dialect === 'sqlserver' ? 'SQL Server' : 'Db2 for i';

  const submit = () => {
    if (copy) dispatch({ type: 'duplicate-project' });
    dispatch({ type: 'convert-to-tables', dialect, choices });
    toast({
      message: `${preview.tables} ${preview.tables === 1 ? 'tabla' : 'tablas'} de ${engineName}${
        preview.junctions ? ` y ${preview.junctions} ${preview.junctions === 1 ? 'intermedia' : 'intermedias'}` : ''
      }${copy ? ', en una copia del proyecto' : ''}`,
      undoable: !copy,
    });
    onClose();
  };

  return (
    <Modal
      title="Pasar documentos a tablas"
      wide
      submitLabel={copy ? 'Crear la copia con tablas' : 'Pasar a tablas'}
      submitDisabled={!nodeIds.length || !canEditSchema}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-grid tables-import">
        <p className="muted-note">
          Las colecciones elegidas pasan a ser tablas (con una clave «id» si no tienen). Lo que llevan dentro pasa a una
          tabla hija con su clave foránea, o a columnas del documento si es un objeto pequeño; las listas de ids, a
          tablas intermedias.
        </p>
        <div className="db2-export-row">
          <label className="field">
            Base de datos
            <select value={dialect} onChange={e => setDialect(e.target.value as SqlDialect)}>
              <option value="sqlserver">SQL Server</option>
              <option value="db2i">Db2 for i (IBM i)</option>
            </select>
          </label>
          <label className="field-inline conversion-copy">
            <input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)} />
            En una copia del proyecto (los documentos se quedan como están)
          </label>
        </div>
        <fieldset className="publish-options">
          <legend>Colecciones</legend>
          <div className="db2-export-tools">
            <Button size="sm" variant="ghost" onClick={() => setUnchecked(new Set())}>
              Todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUnchecked(new Set(collections.map(n => n.id)))}>
              Ninguna
            </Button>
          </div>
          <div className="tables-import-list">
            {collections.map(n => (
              <label key={n.id} className="field-inline">
                <input
                  type="checkbox"
                  checked={!unchecked.has(n.id)}
                  onChange={e =>
                    setUnchecked(current => {
                      const next = new Set(current);
                      if (e.target.checked) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    })
                  }
                />
                <strong>{nodeLabel(project, n)}</strong>
              </label>
            ))}
          </div>
        </fieldset>
        {subdocuments.length > 0 && (
          <fieldset className="publish-options">
            <legend>Lo que llevan dentro</legend>
            <div className="tables-import-list">
              {subdocuments.map(s => {
                const parent = project.schemas.find(x => x.id === s.uses[0].parentTypeId)?.name ?? '';
                const flat = s.canFlatten && (flatten[s.typeId] ?? s.flatten);
                return (
                  <div key={s.typeId} className="conversion-row">
                    <strong>{s.name}</strong>
                    {s.canFlatten ? (
                      <select
                        aria-label={`Qué hacer con ${s.name}`}
                        value={flat ? 'columns' : 'table'}
                        onChange={e =>
                          setFlatten(current => ({ ...current, [s.typeId]: e.target.value === 'columns' }))
                        }
                      >
                        <option value="columns">Columnas en {parent}</option>
                        <option value="table">Tabla aparte (uno a uno)</option>
                      </select>
                    ) : (
                      <span className="muted-note">Tabla</span>
                    )}
                    <small className="conversion-reason">{s.reason}</small>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}
        <label className="field-inline">
          <input type="checkbox" checked={junctions} onChange={e => setJunctions(e.target.checked)} />
          Crear las tablas intermedias de las listas de referencias (muchos a muchos)
        </label>
        {preview.warnings.length > 0 && (
          <ul className="muted-note conversion-warnings">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {!canEditSchema && (
          <p className="muted-note" role="status">
            Tu rol en el grupo no te deja cambiar el esquema.
          </p>
        )}
      </div>
    </Modal>
  );
}
