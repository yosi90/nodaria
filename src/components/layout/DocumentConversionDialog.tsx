import { useMemo, useState } from 'react';
import { convertToDocuments, suggestConversion, type DocumentEngine } from '../../domain/documentConversion';
import { dataTables } from '../../domain/tableData';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/**
 * Pasar tablas a documentos (`documentConversion.ts`): se eligen el motor y las tablas, y para cada una si
 * se incrusta en su tabla padre o queda como colección, con lo que se sugiere y por qué. Por defecto se hace
 * en una copia del proyecto, para no perder el diseño de las tablas.
 */
export function DocumentConversionDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { canEditSchema } = useProjectAccess();
  const toast = useToast();
  const tables = useMemo(() => dataTables(project), [project]);
  const [engine, setEngine] = useState<DocumentEngine>('mongodb');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [copy, setCopy] = useState(true);
  // Barato incluso con muchas tablas: se recalcula en cada cambio del diálogo.
  const chosen = tables.filter(t => !unchecked.has(t.node.id)).map(t => t.node.id);
  const suggestions = suggestConversion(project, chosen);
  const choices = suggestions.map(s => ({
    nodeId: s.nodeId,
    embed: Boolean(s.parent) && (overrides.get(s.nodeId) ?? s.embed),
  }));
  const preview = convertToDocuments(project, engine, choices);
  const engineName = engine === 'mongodb' ? 'MongoDB' : 'Firestore';

  const submit = () => {
    if (copy) dispatch({ type: 'duplicate-project' });
    dispatch({ type: 'convert-to-documents', engine, choices });
    const collections = choices.length - preview.embedded;
    toast({
      message: `${collections} ${collections === 1 ? 'colección' : 'colecciones'} de ${engineName}${
        preview.embedded ? ` y ${preview.embedded} ${preview.embedded === 1 ? 'subdocumento' : 'subdocumentos'}` : ''
      }${copy ? ', en una copia del proyecto' : ''}`,
      undoable: !copy,
    });
    onClose();
  };

  return (
    <Modal
      title="Pasar tablas a documentos"
      wide
      submitLabel={copy ? 'Crear la copia con documentos' : 'Pasar a documentos'}
      submitDisabled={!choices.length || !canEditSchema}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-grid tables-import">
        <p className="muted-note">
          Las tablas elegidas pasan a ser colecciones. Una tabla cuyas filas solo existen con su tabla padre (como las
          líneas de un pedido) se puede incrustar en ella como subdocumento; las demás se apuntan por su id.
        </p>
        <div className="db2-export-row">
          <label className="field">
            Base de documentos
            <select value={engine} onChange={e => setEngine(e.target.value as DocumentEngine)}>
              <option value="mongodb">MongoDB</option>
              <option value="firestore">Firestore</option>
            </select>
          </label>
          <label className="field-inline conversion-copy">
            <input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)} />
            En una copia del proyecto (las tablas se quedan como están)
          </label>
        </div>
        <fieldset className="publish-options">
          <legend>Tablas</legend>
          <div className="db2-export-tools">
            <Button size="sm" variant="ghost" onClick={() => setUnchecked(new Set())}>
              Todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setUnchecked(new Set(tables.map(t => t.node.id)))}>
              Ninguna
            </Button>
          </div>
          <div className="tables-import-list">
            {tables.map(t => {
              const suggestion = suggestions.find(s => s.nodeId === t.node.id);
              const checked = !unchecked.has(t.node.id);
              const embed = choices.find(c => c.nodeId === t.node.id)?.embed ?? false;
              return (
                <div key={t.node.id} className="conversion-row">
                  <label className="field-inline">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e =>
                        setUnchecked(current => {
                          const next = new Set(current);
                          if (e.target.checked) next.delete(t.node.id);
                          else next.add(t.node.id);
                          return next;
                        })
                      }
                    />
                    <strong>{t.name}</strong>
                  </label>
                  {checked && suggestion && (
                    <>
                      {suggestion.parent ? (
                        <select
                          aria-label={`Qué hacer con ${t.name}`}
                          value={embed ? 'embed' : 'collection'}
                          onChange={e =>
                            setOverrides(current => new Map(current).set(t.node.id, e.target.value === 'embed'))
                          }
                        >
                          <option value="collection">Colección</option>
                          <option value="embed">
                            Dentro de {suggestion.parent.name} ({suggestion.parent.many ? 'lista' : 'objeto'})
                          </option>
                        </select>
                      ) : (
                        <span className="muted-note">Colección</span>
                      )}
                      <small className="conversion-reason">
                        {suggestion.embed ? 'Sugerido: ' : ''}
                        {suggestion.reason}
                      </small>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
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
