import { Download, Play, Square, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_QUERY, type DataTable, type SqlQueryDef } from '../../domain/tableData';
import {
  queryError,
  queryQualifiers,
  querySetup,
  resultCsv,
  translateQuery,
  type QueryResult,
} from '../../domain/sqlQuery';
import { downloadText } from '../../services/files';
import { QueryCancelled, runSql } from '../../services/sqlEngine';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';
import { useToast } from '../common/toasts';

interface Props {
  query: SqlQueryDef;
  tables: DataTable[];
  canEdit: boolean;
  onDeleted: () => void;
}

type Run =
  | { status: 'idle' }
  | { status: 'running'; cancel: () => void }
  | { status: 'done'; result: QueryResult }
  | { status: 'error'; message: string; engine: boolean };

/** Una consulta guardada: el editor, ejecutarla en SQLite y sus resultados. Se guarda al escribir. */
export function QueryPanel({ query, tables, canEdit, onDeleted }: Props) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const editor = useRef<HTMLTextAreaElement>(null);
  // Cambiar de consulta cancela la que estuviera en marcha.
  const running = run.status === 'running' ? run.cancel : null;
  useEffect(() => () => running?.(), [running]);

  const save = (patch: Partial<SqlQueryDef>) => dispatch({ type: 'save-sql-query', query: { ...query, ...patch } });
  const execute = () => {
    const refused = queryError(query.sql);
    if (refused) return setRun({ status: 'error', message: refused, engine: false });
    const job = runSql(querySetup(project, tables), translateQuery(query.sql, queryQualifiers(project)));
    setRun({ status: 'running', cancel: job.cancel });
    job.promise.then(
      result => setRun({ status: 'done', result }),
      (error: Error) => setRun({ status: 'error', message: error.message, engine: !(error instanceof QueryCancelled) }),
    );
  };
  const insert = (text: string) => {
    const area = editor.current;
    if (!area || !canEdit) return;
    const start = area.selectionStart;
    const next = `${query.sql.slice(0, start)}${text}${query.sql.slice(area.selectionEnd)}`;
    save({ sql: next });
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const remove = () => {
    dispatch({ type: 'delete-sql-query', id: query.id });
    toast({ message: `«${query.name || 'Consulta'}» borrada`, undoable: true });
    onDeleted();
  };

  return (
    <section className="table-main records-main records-query" aria-label="Consulta">
      <div className="workspace-toolbar">
        <input
          className="records-query-name"
          value={query.name}
          placeholder="Nombre de la consulta"
          aria-label="Nombre de la consulta"
          maxLength={200}
          disabled={!canEdit}
          onChange={e => save({ name: e.target.value })}
        />
        <div className="spacer" />
        {canEdit && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>
            Borrar
          </Button>
        )}
        {run.status === 'running' ? (
          <Button size="sm" icon={Square} onClick={run.cancel}>
            Cancelar
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={Play} title="Ejecutar (Ctrl+Intro)" onClick={execute}>
            Ejecutar
          </Button>
        )}
      </div>
      <div className="records-query-body">
        <textarea
          ref={editor}
          className="records-editor"
          value={query.sql}
          spellCheck={false}
          maxLength={MAX_QUERY}
          aria-label="Consulta SQL"
          placeholder="SELECT * FROM Cliente"
          readOnly={!canEdit}
          onChange={e => save({ sql: e.target.value })}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              execute();
            }
          }}
        />
        <div className="records-tables-hint">
          <span className="muted-note">Tablas:</span>
          {tables.map(t => (
            <button
              key={t.node.id}
              type="button"
              className="chip"
              title={t.columns.map(c => c.name).join(', ')}
              onClick={() => insert(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <QueryOutput run={run} name={query.name} />
      </div>
    </section>
  );
}

function QueryOutput({ run, name }: { run: Run; name: string }) {
  if (run.status === 'idle')
    return (
      <p className="muted-note records-query-note">
        Pulsa «Ejecutar» o Ctrl+Intro. La consulta se hace sobre las filas de las tablas, en SQLite dentro del
        navegador: entiende lo habitual de SQL Server y Db2 (JOIN, GROUP BY, subconsultas, TOP, FETCH FIRST) y no cambia
        los datos.
      </p>
    );
  if (run.status === 'running') return <p className="muted-note records-query-note">Ejecutando…</p>;
  if (run.status === 'error')
    return (
      <div className="records-query-error" role="alert">
        <TriangleAlert size={16} aria-hidden />
        <div>
          <strong>{run.message}</strong>
          {run.engine && (
            <p className="muted-note">
              El motor es SQLite: alguna función propia de SQL Server o de Db2 puede llamarse de otra forma.
            </p>
          )}
        </div>
      </div>
    );
  const { result } = run;
  return (
    <div className="records-result">
      <div className="records-result-head" role="status">
        <span>
          {result.more ? `Más de ${result.total.toLocaleString('es')}` : result.total.toLocaleString('es')}{' '}
          {result.total === 1 ? 'fila' : 'filas'} · {result.ms} ms
          {result.rows.length < result.total ? ` · se muestran las ${result.rows.length} primeras` : ''}
        </span>
        {result.columns.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            onClick={() =>
              downloadText(`${(name || 'consulta').replace(/[\\/:*?"<>|]/g, '_')}.csv`, resultCsv(result), 'text/csv')
            }
          >
            CSV
          </Button>
        )}
      </div>
      {result.columns.length ? (
        <div className="records-result-scroll">
          <table className="data-table records-result-table" aria-label="Resultado de la consulta">
            <thead>
              <tr>
                {result.columns.map((c, i) => (
                  <th key={i}>
                    <span className="records-head">{c}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, j) => (
                    <td
                      key={j}
                      className={
                        value === null ? 'records-null' : typeof value === 'number' ? 'records-number-cell' : ''
                      }
                    >
                      {value === null ? 'NULL' : String(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted-note">La consulta no devuelve columnas.</p>
      )}
    </div>
  );
}
