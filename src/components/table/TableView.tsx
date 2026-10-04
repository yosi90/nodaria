import { ArrowDown, ArrowUp, Columns3, Copy, ExternalLink, Grid3x3, Plus, Search, Table2, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { uid } from '../../domain/factories';
import { allFields, fieldValue, getSchema, nodeLabel, typeMatches } from '../../domain/selectors';
import type { FieldDefinition, FieldValue, Node } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { usePreferences, type TablePreference } from '../../state/preferences';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';
import { Popover } from '../common/Popover';
import { Splitter } from '../common/Splitter';
import { useToast } from '../common/toasts';
import { FieldControl } from '../map/FieldControl';
import { isImageValue } from '../map/images';
import { MatrixView } from './MatrixView';

/*
 * Vista «Tabla»: una hoja por tipo de entidad con una fila por nodo y una columna por atributo,
 * editable en la propia celda. Sirve para rellenar o revisar muchas fichas de golpe. Las columnas
 * ocultas y el orden se recuerdan por proyecto y tipo en este navegador.
 */

const PARENT_COLUMN = '__parent';
const RELATIONS_COLUMN = '__relations';

interface Column {
  id: string;
  label: string;
  field?: FieldDefinition;
}

export function TableView() {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const { confirm } = useDialogs();
  const toast = useToast();
  const entityTypes = project.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  const [typeId, setTypeId] = useState<string | null>(entityTypes[0]?.id ?? null);
  const [matrix, setMatrix] = useState(false);
  const schema = typeId ? getSchema(project, typeId) : undefined;
  const [query, setQuery] = useState('');
  const [columnsAnchor, setColumnsAnchor] = useState<Anchor | null>(null);

  const prefs: TablePreference = (schema && preferences.tables[project.id]?.[schema.id]) ?? {
    hiddenColumns: [],
    sort: null,
  };
  const savePrefs = useCallback(
    (patch: Partial<TablePreference>) => {
      if (!schema) return;
      const mine = preferences.tables[project.id] ?? {};
      setPreference('tables', {
        ...preferences.tables,
        [project.id]: { ...mine, [schema.id]: { ...(mine[schema.id] ?? { hiddenColumns: [], sort: null }), ...patch } },
      });
    },
    [preferences.tables, project.id, schema, setPreference],
  );

  const fields = useMemo(() => (schema ? allFields(project, schema.id) : []), [project, schema]);
  const titleField = fields.find(f => f.isTitle) ?? fields.find(f => f.type === 'text');
  const columns = useMemo<Column[]>(() => {
    const result: Column[] = fields.filter(f => f !== titleField).map(f => ({ id: f.id, label: f.label, field: f }));
    result.push({ id: PARENT_COLUMN, label: 'Dentro de' });
    result.push({ id: RELATIONS_COLUMN, label: 'Relaciones' });
    return result;
  }, [fields, titleField]);
  const visibleColumns = columns.filter(c => !prefs.hiddenColumns.includes(c.id));

  // Filas: nodos del tipo (y sus subtipos), filtradas por texto y ordenadas.
  const degree = useMemo(() => {
    const map = new Map<string, number>();
    project.relations.forEach(r => {
      map.set(r.sourceId, (map.get(r.sourceId) ?? 0) + 1);
      map.set(r.targetId, (map.get(r.targetId) ?? 0) + 1);
    });
    return map;
  }, [project.relations]);
  const cellText = useCallback(
    (n: Node, column: Column): string => {
      if (column.id === PARENT_COLUMN) {
        const parent = n.parentId ? project.nodes.find(x => x.id === n.parentId) : undefined;
        return parent ? nodeLabel(project, parent) : '';
      }
      if (column.id === RELATIONS_COLUMN) return String(degree.get(n.id) ?? 0);
      const f = column.field!;
      const v = fieldValue(f, n.values, allFields(project, n.typeId), { project, node: n });
      if (f.type === 'nodeRef' || f.type === 'nodeRefs') {
        const ids = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
        return ids
          .map(id => project.nodes.find(x => x.id === id))
          .filter((x): x is Node => Boolean(x))
          .map(x => nodeLabel(project, x))
          .join(', ');
      }
      if (f.type === 'image') return isImageValue(v) ? 'imagen' : '';
      if (f.type === 'boolean') return v ? 'sí' : 'no';
      return v === undefined || v === null ? '' : String(v);
    },
    [project, degree],
  );
  const rows = useMemo(() => {
    if (!schema) return [];
    const q = query.trim().toLowerCase();
    let list = project.nodes.filter(n => typeMatches(project, n.typeId, [schema.id]));
    if (q)
      list = list.filter(
        n =>
          nodeLabel(project, n).toLowerCase().includes(q) ||
          columns.some(c => cellText(n, c).toLowerCase().includes(q)),
      );
    if (prefs.sort) {
      const { column, direction } = prefs.sort;
      const col = columns.find(c => c.id === column);
      const key = (n: Node) => (col ? cellText(n, col) : nodeLabel(project, n));
      const numeric = col?.field?.type === 'number' || column === RELATIONS_COLUMN;
      list = [...list].sort((x, y) => {
        const a = key(x);
        const b = key(y);
        const cmp = numeric ? Number(a || 0) - Number(b || 0) : a.localeCompare(b, 'es', { sensitivity: 'base' });
        return direction === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [project, schema, query, columns, cellText, prefs.sort]);

  const updateValue = (n: Node, fieldId: string, value: FieldValue) =>
    dispatch({ type: 'update-node', id: n.id, values: { ...n.values, [fieldId]: value }, parentId: n.parentId });
  const sortBy = (columnId: string) => {
    const current = prefs.sort;
    if (current?.column === columnId)
      savePrefs({ sort: current.direction === 'asc' ? { column: columnId, direction: 'desc' } : null });
    else savePrefs({ sort: { column: columnId, direction: 'asc' } });
  };
  const addRow = () => {
    if (!schema) return;
    const id = uid('node');
    dispatch({ type: 'add-node', typeId: schema.id, parentId: null, id });
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-row="${id}"] input`);
      input?.focus();
      input?.scrollIntoView({ block: 'nearest' });
    }, 50);
  };
  const removeRow = async (n: Node) => {
    const ok = await confirm({
      title: `Eliminar «${nodeLabel(project, n)}»`,
      message: 'Se eliminará con sus subnodos y relaciones. Puedes deshacerlo después.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    toast({ message: `«${nodeLabel(project, n)}» eliminado`, undoable: true });
    dispatch({ type: 'delete-node', id: n.id });
  };
  const sortIcon = (columnId: string) =>
    prefs.sort?.column === columnId ? (
      prefs.sort.direction === 'asc' ? (
        <ArrowUp size={12} aria-hidden />
      ) : (
        <ArrowDown size={12} aria-hidden />
      )
    ) : null;
  const ariaSort = (columnId: string) =>
    prefs.sort?.column === columnId ? (prefs.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;

  const counts = useMemo(
    () =>
      new Map(entityTypes.map(s => [s.id, project.nodes.filter(n => typeMatches(project, n.typeId, [s.id])).length])),
    [entityTypes, project],
  );

  return (
    <main className="table-layout" style={{ gridTemplateColumns: `${preferences.typeListWidth}px minmax(0, 1fr)` }}>
      <aside className="side-panel left" style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }} aria-label="Tipos">
        <div className="panel-head">
          <h2>Tabla</h2>
        </div>
        <nav className="type-items" aria-label="Tipos de entidad">
          <div className="type-group-title">Un tipo por hoja</div>
          {entityTypes.map(item => (
            <button
              key={item.id}
              type="button"
              className={`type-item ${!matrix && item.id === schema?.id ? 'active' : ''}`}
              data-type-id={item.id}
              aria-current={!matrix && item.id === schema?.id ? 'page' : undefined}
              onClick={() => {
                setTypeId(item.id);
                setMatrix(false);
                setQuery('');
              }}
            >
              <TypeIcon icon={item.icon} color={item.color} />
              <span className="names">
                <strong>{item.name || 'Sin nombre'}</strong>
                <small>
                  {counts.get(item.id) ?? 0} {counts.get(item.id) === 1 ? 'nodo' : 'nodos'}
                </small>
              </span>
            </button>
          ))}
          <div className="type-group-title">Cruces</div>
          <button
            type="button"
            className={`type-item ${matrix ? 'active' : ''}`}
            aria-current={matrix ? 'page' : undefined}
            onClick={() => setMatrix(true)}
          >
            <span className="type-icon" aria-hidden>
              <Grid3x3 size={13} strokeWidth={2.2} />
            </span>
            <span className="names">
              <strong>Matriz de relaciones</strong>
              <small>tipo × tipo, huecos y concentraciones</small>
            </span>
          </button>
        </nav>
        <Splitter
          width={preferences.typeListWidth}
          grow="right"
          label="Redimensionar lista de tipos"
          onChange={width => setPreference('typeListWidth', width)}
        />
      </aside>
      {matrix ? (
        <MatrixView />
      ) : schema ? (
        <section className="table-main">
          <div className="workspace-toolbar">
            <TypeIcon icon={schema.icon} color={schema.color} />
            <strong>{schema.name}</strong>
            <span className="badge">
              {rows.length}
              {query ? ` de ${counts.get(schema.id) ?? 0}` : ''}
            </span>
            <div className="search-input" style={{ marginLeft: 8, width: 240 }}>
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={query}
                placeholder="Filtrar filas…"
                aria-label="Filtrar filas"
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="spacer" />
            <Button
              size="sm"
              icon={Columns3}
              aria-haspopup="dialog"
              aria-expanded={Boolean(columnsAnchor)}
              onClick={event =>
                columnsAnchor ? setColumnsAnchor(null) : setColumnsAnchor(anchorOf(event.currentTarget))
              }
            >
              Columnas
            </Button>
            {columnsAnchor && (
              <Popover anchor={columnsAnchor} onClose={() => setColumnsAnchor(null)} role="dialog" label="Columnas">
                <div className="columns-menu">
                  {columns.map(c => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={!prefs.hiddenColumns.includes(c.id)}
                        onChange={e =>
                          savePrefs({
                            hiddenColumns: e.target.checked
                              ? prefs.hiddenColumns.filter(id => id !== c.id)
                              : [...prefs.hiddenColumns, c.id],
                          })
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </Popover>
            )}
            <Button size="sm" variant="primary" icon={Plus} onClick={addRow}>
              Nuevo {schema.name.toLowerCase()}
            </Button>
          </div>
          <div className="table-scroll">
            {rows.length ? (
              <table className="data-table" aria-label={`Nodos de tipo ${schema.name}`}>
                <thead>
                  <tr>
                    <th aria-sort={ariaSort('__title')}>
                      <button type="button" className="col-head" onClick={() => sortBy('__title')}>
                        {titleField?.label ?? 'Nombre'} {sortIcon('__title')}
                      </button>
                    </th>
                    {visibleColumns.map(c => (
                      <th key={c.id} aria-sort={ariaSort(c.id)}>
                        <button type="button" className="col-head" onClick={() => sortBy(c.id)}>
                          {c.field?.icon && <TypeIcon icon={c.field.icon} color={schema.color} size="sm" />}
                          {c.label} {sortIcon(c.id)}
                        </button>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(n => (
                    <tr key={n.id} data-row={n.id}>
                      <td className="cell-title">
                        <div className="cell-title-wrap">
                          {titleField ? (
                            <input
                              value={String(n.values[titleField.id] ?? '')}
                              placeholder={schema.name}
                              aria-label={`${titleField.label} de ${nodeLabel(project, n)}`}
                              onChange={e => updateValue(n, titleField.id, e.target.value)}
                            />
                          ) : (
                            <span className="cell-readonly">{nodeLabel(project, n)}</span>
                          )}
                          <IconButton
                            icon={ExternalLink}
                            size="sm"
                            label="Abrir en el mapa"
                            onClick={() => select({ kind: 'node', id: n.id }, { reveal: true })}
                          />
                        </div>
                      </td>
                      {visibleColumns.map(c => (
                        <td key={c.id} className={c.field && c.field.type !== 'computed' ? '' : 'cell-readonly'}>
                          {c.field ? (
                            c.field.type === 'image' ? (
                              isImageValue(n.values[c.field.id]) ? (
                                <img className="table-thumb" src={String(n.values[c.field.id])} alt="" />
                              ) : (
                                ''
                              )
                            ) : (
                              <FieldControl
                                field={c.field}
                                value={fieldValue(c.field, n.values, allFields(project, n.typeId), {
                                  project,
                                  node: n,
                                })}
                                ownerId={n.id}
                                onChange={v => updateValue(n, c.field!.id, v)}
                              />
                            )
                          ) : c.id === PARENT_COLUMN && n.parentId ? (
                            <span
                              className="relation-other"
                              role="link"
                              tabIndex={0}
                              onClick={() => select({ kind: 'node', id: n.parentId! }, { reveal: true })}
                              onKeyDown={e =>
                                e.key === 'Enter' && select({ kind: 'node', id: n.parentId! }, { reveal: true })
                              }
                            >
                              {cellText(n, c)}
                            </span>
                          ) : (
                            cellText(n, c)
                          )}
                        </td>
                      ))}
                      <td className="cell-actions">
                        <IconButton
                          icon={Copy}
                          size="sm"
                          label="Duplicar"
                          tooltipSide="left"
                          onClick={() => {
                            const newId = uid('node');
                            dispatch({ type: 'duplicate-node', id: n.id, newId });
                            toast({ message: `«${nodeLabel(project, n)}» duplicado`, undoable: true });
                          }}
                        />
                        <IconButton
                          icon={Trash2}
                          size="sm"
                          variant="danger"
                          label="Eliminar"
                          tooltipSide="left"
                          onClick={() => void removeRow(n)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="table-empty">
                {query
                  ? 'Ninguna fila coincide con el filtro.'
                  : `Aún no hay nodos de tipo «${schema.name}». Pulsa «Nuevo».`}
              </p>
            )}
          </div>
        </section>
      ) : (
        <EmptyState icon={Table2} title="Una hoja por tipo">
          Crea primero un tipo de entidad en «Tipos»; aquí verás sus nodos como filas y sus atributos como columnas.
        </EmptyState>
      )}
    </main>
  );
}
