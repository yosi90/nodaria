import { CircleHelp, Database, Plus, Search, TriangleAlert, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { engineLabel } from '../../domain/database';
import { uid } from '../../domain/factories';
import { dataTables, issueCount, rowsOf, tableRowIssues } from '../../domain/tableData';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { Button, IconButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Splitter } from '../common/Splitter';
import { openTablesImport } from '../layout/openDialogs';
import { QueryPanel } from './QueryPanel';
import { RecordsGrid } from './RecordsGrid';

type Selection = { kind: 'table'; id: string } | { kind: 'query'; id: string };

/**
 * Vista «Registros» (docs/roadmaps/ROADMAP_DATOS_BD.md): filas de ejemplo de cada tabla relacional y
 * consultas SQL sobre ellas. A la izquierda, las tablas (con sus filas y errores) y las consultas guardadas.
 */
export function RecordsView() {
  const { project, dispatch } = useApp();
  const { canEdit } = useProjectAccess();
  const { setView, openHelp } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const tables = useMemo(() => dataTables(project), [project]);
  const issues = useMemo(
    () => new Map(tables.map(t => [t.node.id, tableRowIssues(project, t, tables)])),
    [project, tables],
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const current: Selection | null =
    selection &&
    (selection.kind === 'table'
      ? tables.some(t => t.node.id === selection.id)
      : project.sqlQueries.some(q => q.id === selection.id))
      ? selection
      : tables[0]
        ? { kind: 'table', id: tables[0].node.id }
        : null;

  if (!tables.length)
    return (
      <main className="records-layout empty">
        <EmptyState
          icon={Database}
          title="Sin tablas todavía"
          action={
            <div className="guide-actions">
              <Button icon={Database} onClick={() => setView('schema')}>
                Ir a Tipos
              </Button>
              <Button icon={Upload} onClick={openTablesImport}>
                Importar tablas
              </Button>
            </div>
          }
        >
          Aquí se rellenan filas de ejemplo de las tablas y se consultan con SQL. Marca un tipo como tabla de SQL Server
          o de Db2 for i en «Tipos» y crea sus tablas en el mapa, o importa las que ya tienes desde su SQL o su DDS.
        </EmptyState>
      </main>
    );

  const newQuery = () => {
    const id = uid('sqlq');
    const first = tables[0];
    dispatch({
      type: 'save-sql-query',
      query: { id, name: `Consulta ${project.sqlQueries.length + 1}`, sql: `SELECT *\nFROM ${first.name}` },
    });
    setSelection({ kind: 'query', id });
  };
  const engines = new Set(tables.map(t => t.dialect));
  const table = current?.kind === 'table' ? tables.find(t => t.node.id === current.id) : undefined;
  const query = current?.kind === 'query' ? project.sqlQueries.find(q => q.id === current.id) : undefined;

  return (
    <main
      className="table-layout records-layout"
      data-tour="records"
      style={{ gridTemplateColumns: `${preferences.typeListWidth}px minmax(0, 1fr)` }}
    >
      <aside className="side-panel left" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }} aria-label="Tablas">
        <div className="panel-head">
          <h2>Registros</h2>
          <IconButton icon={CircleHelp} size="sm" label="Guía de bases de datos" onClick={() => openHelp('database')} />
        </div>
        <nav className="type-items" aria-label="Tablas y consultas">
          {[...engines].map(engine => (
            <div key={engine} className="records-group">
              <div className="type-group-title">{engines.size > 1 ? engineLabel(engine) : 'Tablas'}</div>
              {tables
                .filter(t => t.dialect === engine)
                .map(t => {
                  const count = rowsOf(project, t.node.id).length;
                  const errors = issueCount(issues.get(t.node.id) ?? new Map());
                  const active = current?.kind === 'table' && current.id === t.node.id;
                  return (
                    <button
                      key={t.node.id}
                      type="button"
                      className={`type-item ${active ? 'active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setSelection({ kind: 'table', id: t.node.id })}
                    >
                      <span className="type-icon" aria-hidden>
                        <Database size={13} strokeWidth={2.2} />
                      </span>
                      <span className="names">
                        <strong>{t.name}</strong>
                        <small>
                          {count} {count === 1 ? 'fila' : 'filas'}
                          {errors > 0 && (
                            <span className="records-side-errors">
                              {' · '}
                              <TriangleAlert size={11} aria-hidden /> {errors}
                            </span>
                          )}
                        </small>
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
          <div className="type-group-title records-queries-title">
            Consultas
            {canEdit && (
              <button type="button" className="link-button" onClick={newQuery}>
                <Plus size={12} aria-hidden /> Nueva
              </button>
            )}
          </div>
          {project.sqlQueries.map(q => {
            const active = current?.kind === 'query' && current.id === q.id;
            return (
              <button
                key={q.id}
                type="button"
                className={`type-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setSelection({ kind: 'query', id: q.id })}
              >
                <span className="type-icon" aria-hidden>
                  <Search size={13} strokeWidth={2.2} />
                </span>
                <span className="names">
                  <strong>{q.name || 'Sin nombre'}</strong>
                  <small className="records-query-preview">{q.sql.replace(/\s+/g, ' ').slice(0, 60)}</small>
                </span>
              </button>
            );
          })}
          {!project.sqlQueries.length && (
            <p className="muted-note records-side-note">
              {canEdit ? 'Crea una consulta SQL para cruzar las filas de las tablas.' : 'Sin consultas guardadas.'}
            </p>
          )}
        </nav>
        <Splitter
          width={preferences.typeListWidth}
          grow="right"
          label="Redimensionar lista de tablas"
          onChange={width => setPreference('typeListWidth', width)}
        />
      </aside>
      {table ? (
        <RecordsGrid
          key={table.node.id}
          table={table}
          tables={tables}
          issues={issues.get(table.node.id) ?? new Map()}
          canEdit={canEdit}
        />
      ) : query ? (
        <QueryPanel
          key={query.id}
          query={query}
          tables={tables}
          canEdit={canEdit}
          onDeleted={() => setSelection(null)}
        />
      ) : null}
    </main>
  );
}
