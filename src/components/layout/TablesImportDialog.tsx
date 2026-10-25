import { Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { engineOf, sqlTypeText, type SqlDialect } from '../../domain/database';
import { guessDialect, isDds, mergeResults, parseDds, parseSqlDdl } from '../../domain/schemaImport';
import { importPreview } from '../../domain/tablesImport';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/** Hasta dónde se lee un archivo: un script de esquema no llega ni de lejos. */
const MAX_FILE = 5 * 1024 * 1024;

/** Índices y UNIQUE de una tabla leída (los de un archivo lógico se suman a su PFILE). */
const indexCount = (t: { indexes: string[][]; uniques: string[][] }) => t.indexes.length + t.uniques.length;

/** El nombre del archivo físico a partir del archivo subido («CLIENTES.pf» → CLIENTES). */
const fileTable = (name: string) => name.replace(/\.[^.]*$/, '').toUpperCase();

/**
 * Importar tablas que ya existen (docs/roadmaps/ROADMAP_DATOS_BD.md): se pega o se sube el SQL que las crea
 * (SQL Server o Db2) o los fuentes DDS de los archivos físicos y lógicos, se ve qué se ha leído y se eligen
 * las que se crean, como subtipos del tipo que se diga.
 */
export function TablesImportDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { canEditSchema } = useProjectAccess();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [ddsName, setDdsName] = useState('');
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [dialectChoice, setDialectChoice] = useState<SqlDialect | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const pastedDds = isDds(text);
  const sources = useMemo(
    () => [...files, ...(text.trim() ? [{ name: pastedDds ? ddsName || 'ARCHIVO' : '', text }] : [])],
    [files, text, ddsName, pastedDds],
  );
  const guessed = useMemo(() => guessDialect(sources.map(s => s.text).join('\n')), [sources]);
  const dialect = dialectChoice ?? guessed;
  const result = useMemo(
    () =>
      mergeResults(
        sources.map(s =>
          isDds(s.text) ? parseDds(s.text, fileTable(s.name || 'ARCHIVO')) : parseSqlDdl(s.text, dialect),
        ),
        dialect,
      ),
    [sources, dialect],
  );
  const preview = useMemo(() => importPreview(project, result), [project, result]);
  const bases = project.schemas.filter(s => s.kind === 'entity' && !s.embedded);
  // Por defecto, un tipo abstracto de esa base (como «Archivo físico»), si hay uno.
  const suggested = bases.find(s => s.isAbstract && engineOf(project, s.id) === dialect);
  const [baseChoice, setBaseChoice] = useState<string | null | undefined>(undefined);
  const baseTypeId = baseChoice === undefined ? (suggested?.id ?? null) : baseChoice;
  const chosen = preview.filter(x => !x.exists && !unchecked.has(x.table.name)).map(x => x.table.name);
  const warnings = [...result.warnings, ...result.tables.flatMap(t => t.warnings.map(w => `${t.name}.${w}`))];

  const readFiles = async (list: FileList | null) => {
    if (!list) return;
    const read = await Promise.all(
      [...list].filter(f => f.size <= MAX_FILE).map(async f => ({ name: f.name, text: await f.text() })),
    );
    setFiles(current => [...current.filter(c => !read.some(r => r.name === c.name)), ...read]);
  };

  const submit = () => {
    dispatch({ type: 'import-tables', result, options: { tables: chosen, baseTypeId } });
    toast({
      message: `${chosen.length === 1 ? '1 tabla importada' : `${chosen.length} tablas importadas`}: las verás en Tipos y en el mapa, con la disposición «Base de datos»`,
      undoable: true,
    });
    onClose();
  };

  return (
    <Modal
      title="Importar tablas"
      wide
      submitLabel={chosen.length === 1 ? 'Importar 1 tabla' : `Importar ${chosen.length} tablas`}
      submitDisabled={!chosen.length || !canEditSchema}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="form-grid tables-import">
        <p className="muted-note">
          Pega o sube el SQL que crea las tablas (los <code>CREATE TABLE</code> de SQL Server o de Db2, con sus{' '}
          <code>ALTER TABLE</code>, índices y descripciones) o los fuentes DDS de los archivos físicos y lógicos del
          AS/400, uno por archivo. Cada tabla pasa a ser un tipo con sus columnas y un nodo con su nombre; las que ya
          están en el proyecto no se tocan, pero las nuevas pueden apuntarlas.
        </p>
        <label className="field">
          SQL o DDS
          <textarea
            className="tables-import-text"
            value={text}
            spellCheck={false}
            placeholder={
              'CREATE TABLE Cliente (\n  id int IDENTITY(1,1) PRIMARY KEY,\n  nombre nvarchar(100) NOT NULL\n);'
            }
            onChange={e => setText(e.target.value)}
          />
        </label>
        {pastedDds && (
          <label className="field">
            Nombre del archivo físico
            <input
              value={ddsName}
              maxLength={10}
              spellCheck={false}
              placeholder="CLIENTES"
              onChange={e => setDdsName(e.target.value.toUpperCase())}
            />
            <small>El fuente DDS no lo lleva: es el nombre del miembro.</small>
          </label>
        )}
        <div className="tables-import-files">
          <Button size="sm" icon={Upload} onClick={() => fileInput.current?.click()}>
            Subir archivos
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept=".sql,.ddl,.txt,.pf,.lf,.dds,.mbr"
            onChange={e => {
              void readFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {files.map(f => (
            <span key={f.name} className="chip">
              {f.name}
              <button
                type="button"
                aria-label={`Quitar ${f.name}`}
                onClick={() => setFiles(current => current.filter(c => c.name !== f.name))}
              >
                ×
              </button>
            </span>
          ))}
          <small className="muted-note">El nombre de un fuente DDS es el del archivo (CLIENTES.pf → CLIENTES).</small>
        </div>
        <div className="db2-export-row">
          <label className="field">
            Base de datos
            <select
              value={dialect}
              onChange={e => setDialectChoice(e.target.value as SqlDialect)}
              aria-describedby="import-dialect-note"
            >
              <option value="sqlserver">SQL Server</option>
              <option value="db2i">Db2 for i (IBM i)</option>
            </select>
            <small id="import-dialect-note">
              {dialectChoice ? 'Elegida a mano.' : 'Deducida de lo que has pegado; cámbiala si no es.'}
            </small>
          </label>
          <label className="field">
            Subtipo de
            <select value={baseTypeId ?? ''} onChange={e => setBaseChoice(e.target.value || null)}>
              <option value="">Ningún tipo (tipos sueltos)</option>
              {bases.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || 'Sin nombre'}
                </option>
              ))}
            </select>
            <small>Las tablas heredan sus atributos (como el título) y su base de datos.</small>
          </label>
        </div>
        {preview.length > 0 && (
          <fieldset className="publish-options">
            <legend>Tablas leídas</legend>
            <div className="tables-import-list">
              {preview.map(({ table, exists }) => {
                const keys = table.primaryKey.join(', ');
                return (
                  <label key={table.name} className="field-inline">
                    <input
                      type="checkbox"
                      disabled={exists}
                      checked={!exists && !unchecked.has(table.name)}
                      onChange={e =>
                        setUnchecked(current => {
                          const next = new Set(current);
                          if (e.target.checked) next.delete(table.name);
                          else next.add(table.name);
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{table.name}</strong>
                      {table.description && <span className="muted-note"> · {table.description}</span>}
                      <small className="tables-import-detail">
                        {exists
                          ? 'Ya está en el proyecto'
                          : `${table.columns.length} ${table.columns.length === 1 ? 'columna' : 'columnas'}${keys ? ` · PK ${keys}` : ''}${table.foreignKeys.length ? ` · ${table.foreignKeys.length} FK` : ''}${indexCount(table) ? ` · ${indexCount(table)} ${indexCount(table) === 1 ? 'índice' : 'índices'}` : ''}`}
                        {!exists && table.columns.length > 0 && (
                          <span title={table.columns.map(c => `${c.name} ${sqlTypeText(c.type)}`).join('\n')}>
                            {' '}
                            ·{' '}
                            {table.columns
                              .slice(0, 4)
                              .map(c => `${c.name} ${sqlTypeText(c.type)}`)
                              .join(', ')}
                            {table.columns.length > 4 ? '…' : ''}
                          </span>
                        )}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {sources.length > 0 && !preview.length && (
          <p className="muted-note" role="status">
            No se ha encontrado ninguna tabla. Comprueba que es un CREATE TABLE o el fuente DDS de un archivo físico.
          </p>
        )}
        {warnings.length > 0 && (
          <details className="tables-import-warnings">
            <summary>{warnings.length === 1 ? '1 aviso' : `${warnings.length} avisos`} de lo que se ha leído</summary>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
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
