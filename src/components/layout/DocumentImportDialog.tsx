import { useState } from 'react';
import { engineOf } from '../../domain/database';
import {
  documentImportPreview,
  parseDocuments,
  sampleCollection,
  type SampleCollection,
} from '../../domain/documentImport';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';
import { BaseTypeField, ReadWarnings, SchemaLockedNote, SourceFiles, type SourceFile } from './schemaDialogParts';

/** Hasta dónde se lee un archivo de muestra. */
const MAX_FILE = 10 * 1024 * 1024;

/** El nombre de la colección a partir del archivo («pedidos.json» → pedidos). */
const fileCollection = (name: string) => name.replace(/\.[^.]*$/, '');

/**
 * Importar colecciones de documentos que ya existen (`documentImport.ts`): se pega o se sube una muestra de
 * documentos por colección y se ve la forma que se deduce antes de crear los tipos.
 */
export function DocumentImportDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { canEditSchema } = useProjectAccess();
  const toast = useToast();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [engineChoice, setEngineChoice] = useState<'mongodb' | 'firestore' | null>(null);
  const [baseChoice, setBaseChoice] = useState<string | null | undefined>(undefined);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());

  // Cada fuente es una colección (o varias, si es un objeto con una lista por colección).
  const errors: string[] = [];
  const collections: SampleCollection[] = [];
  const sources = [...files, ...(text.trim() ? [{ name: name.trim() || 'coleccion', text }] : [])];
  sources.forEach(source => {
    try {
      const read = parseDocuments(source.text);
      if ('collections' in read)
        Object.entries(read.collections).forEach(([key, docs]) => collections.push(sampleCollection(key, docs)));
      else if (read.documents.length) collections.push(sampleCollection(fileCollection(source.name), read.documents));
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const all = sources.map(s => s.text).join('\n');
  const guessed = /\$oid|ObjectId\(/.test(all)
    ? 'mongodb'
    : /_seconds|__name__|"\$ref"/.test(all)
      ? 'firestore'
      : 'mongodb';
  const engine = engineChoice ?? guessed;
  const preview = documentImportPreview(project, collections, engine);
  const bases = project.schemas.filter(s => s.kind === 'entity' && !s.embedded);
  const suggested = bases.find(s => s.isAbstract && engineOf(project, s.id) === engine);
  const baseTypeId = baseChoice === undefined ? (suggested?.id ?? null) : baseChoice;
  const chosen = preview.filter(x => !x.exists && !unchecked.has(x.collection.name)).map(x => x.collection);
  const warnings = [...errors, ...collections.flatMap(c => c.warnings)];

  const submit = () => {
    dispatch({ type: 'import-collections', collections: chosen, options: { engine, baseTypeId } });
    toast({
      message: `${chosen.length === 1 ? '1 colección importada' : `${chosen.length} colecciones importadas`}: en Tipos y en el mapa, con la disposición «Base de datos»`,
      undoable: true,
    });
    onClose();
  };

  return (
    <Modal
      title="Importar colecciones"
      wide
      submitLabel={chosen.length === 1 ? 'Importar 1 colección' : `Importar ${chosen.length} colecciones`}
      submitDisabled={!chosen.length || !canEditSchema}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-grid tables-import">
        <p className="muted-note">
          Pega o sube una muestra de documentos de cada colección: lo que da <code>mongoexport</code>, un array JSON, un
          documento por línea o lo que escribe mongosh. Se deducen los campos y sus tipos, los obligatorios, lo que va
          dentro (subdocumentos) y las referencias a otras colecciones por su id. Con más documentos, mejor.
        </p>
        <div className="db2-export-row">
          <label className="field">
            Colección
            <input value={name} spellCheck={false} placeholder="pedidos" onChange={e => setName(e.target.value)} />
            <small>El nombre de lo que pegas. Un archivo se llama como su colección (pedidos.json).</small>
          </label>
          <SourceFiles files={files} onChange={setFiles} accept=".json,.ndjson,.jsonl,.txt,.js" maxBytes={MAX_FILE} />
        </div>
        <label className="field">
          Documentos
          <textarea
            className="tables-import-text"
            value={text}
            spellCheck={false}
            placeholder={
              '[\n  { "_id": { "$oid": "…" }, "nombre": "Ana", "alta": { "$date": "2026-10-01T00:00:00Z" } }\n]'
            }
            onChange={e => setText(e.target.value)}
          />
        </label>
        <div className="db2-export-row">
          <label className="field">
            Base de datos
            <select value={engine} onChange={e => setEngineChoice(e.target.value as 'mongodb' | 'firestore')}>
              <option value="mongodb">MongoDB</option>
              <option value="firestore">Firestore</option>
            </select>
            <small>{engineChoice ? 'Elegida a mano.' : 'Deducida de los documentos; cámbiala si no es.'}</small>
          </label>
          <BaseTypeField bases={bases} value={baseTypeId} onChange={setBaseChoice} />
        </div>
        {preview.length > 0 && (
          <fieldset className="publish-options">
            <legend>Colecciones leídas</legend>
            <div className="tables-import-list">
              {preview.map(({ collection, exists }) => {
                const inside = collection.shape.fields.filter(f => f.shape).length;
                const ids = collection.shape.fields.filter(
                  f => f.kind === 'objectId' || (f.kind === 'array' && f.items === 'objectId'),
                ).length;
                return (
                  <label key={collection.name} className="field-inline">
                    <input
                      type="checkbox"
                      disabled={exists}
                      checked={!exists && !unchecked.has(collection.name)}
                      onChange={e =>
                        setUnchecked(current => {
                          const next = new Set(current);
                          if (e.target.checked) next.delete(collection.name);
                          else next.add(collection.name);
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{collection.name}</strong>
                      <small className="tables-import-detail">
                        {exists
                          ? 'Ya está en el proyecto'
                          : `${collection.shape.documents} documentos · ${collection.shape.fields.length} campos${inside ? ` · ${inside} con subdocumentos` : ''}${ids ? ` · ${ids} con ids` : ''} · ${collection.shape.fields
                              .slice(0, 5)
                              .map(
                                f => `${f.key}${f.required ? '' : '?'} ${f.kind === 'array' ? `[${f.items}]` : f.kind}`,
                              )
                              .join(', ')}${collection.shape.fields.length > 5 ? '…' : ''}`}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {sources.length > 0 && !preview.length && !errors.length && (
          <p className="muted-note" role="status">
            No hay documentos que leer.
          </p>
        )}
        <ReadWarnings warnings={warnings} open={errors.length > 0} />
        {!canEditSchema && <SchemaLockedNote />}
      </div>
    </Modal>
  );
}
