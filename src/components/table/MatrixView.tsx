import { ExternalLink, Grid3x3, Plus } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { uid } from '../../domain/factories';
import { cardinalityWarning } from '../../domain/cardinality';
import { compatibleRelationTypes, getSchema, nodeLabel, relationRole, typeMatches } from '../../domain/selectors';
import type { Node, Relation } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { usePreferences, type MatrixPreference } from '../../state/preferences';
import { anchorOf, type Anchor } from '../common/anchor';
import { TypeIcon } from '../common/icons';
import { Menu, type MenuEntry } from '../common/Menu';
import { schemaOption } from '../common/options';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';

/*
 * Matriz de relaciones: un tipo en filas y otro en columnas; cada celda muestra las relaciones entre
 * ese par de nodos (un punto por relación, con el color de su tipo). Las filas y columnas con más
 * relaciones se ven a simple vista; las celdas vacías muestran los huecos y permiten crear la
 * relación directamente.
 */

export function MatrixView() {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const toast = useToast();
  const entityTypes = project.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  const relationTypes = project.schemas.filter(s => s.kind === 'relationship');
  const stored = preferences.matrix[project.id];
  const prefs: MatrixPreference = {
    rowType:
      stored?.rowType && entityTypes.some(s => s.id === stored.rowType) ? stored.rowType : (entityTypes[0]?.id ?? ''),
    colType:
      stored?.colType && entityTypes.some(s => s.id === stored.colType) ? stored.colType : (entityTypes[0]?.id ?? ''),
    relationType:
      stored?.relationType && relationTypes.some(s => s.id === stored.relationType) ? stored.relationType : null,
    hideEmpty: stored?.hideEmpty ?? false,
    sortByCount: stored?.sortByCount ?? false,
  };
  const save = (patch: Partial<MatrixPreference>) =>
    setPreference('matrix', { ...preferences.matrix, [project.id]: { ...prefs, ...patch } });
  const [cell, setCell] = useState<{ anchor: Anchor; a: Node; b: Node } | null>(null);

  const rowSchema = getSchema(project, prefs.rowType);
  const colSchema = getSchema(project, prefs.colType);
  const relationsBetween = useMemo(() => {
    const map = new Map<string, Relation[]>();
    project.relations
      .filter(r => !prefs.relationType || r.typeId === prefs.relationType)
      .forEach(r => {
        const add = (k: string) => map.set(k, [...(map.get(k) ?? []), r]);
        add(`${r.sourceId}|${r.targetId}`);
        if (r.sourceId !== r.targetId) add(`${r.targetId}|${r.sourceId}`);
      });
    return map;
  }, [project.relations, prefs.relationType]);
  const between = (a: Node, b: Node) => relationsBetween.get(`${a.id}|${b.id}`) ?? [];

  const { rows, cols, rowTotals, colTotals } = useMemo(() => {
    let rows = project.nodes.filter(n => rowSchema && typeMatches(project, n.typeId, [rowSchema.id]));
    let cols = project.nodes.filter(n => colSchema && typeMatches(project, n.typeId, [colSchema.id]));
    const rowTotals = new Map(
      rows.map(a => [a.id, cols.reduce((sum, b) => sum + (a.id === b.id ? 0 : between(a, b).length), 0)]),
    );
    const colTotals = new Map(
      cols.map(b => [b.id, rows.reduce((sum, a) => sum + (a.id === b.id ? 0 : between(a, b).length), 0)]),
    );
    if (prefs.hideEmpty) {
      rows = rows.filter(a => (rowTotals.get(a.id) ?? 0) > 0);
      cols = cols.filter(b => (colTotals.get(b.id) ?? 0) > 0);
    }
    if (prefs.sortByCount) {
      rows = [...rows].sort((x, y) => (rowTotals.get(y.id) ?? 0) - (rowTotals.get(x.id) ?? 0));
      cols = [...cols].sort((x, y) => (colTotals.get(y.id) ?? 0) - (colTotals.get(x.id) ?? 0));
    }
    return { rows, cols, rowTotals, colTotals };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `between` deriva de relationsBetween
  }, [project, rowSchema, colSchema, relationsBetween, prefs.hideEmpty, prefs.sortByCount]);

  const maxCell = useMemo(
    () => Math.max(1, ...rows.flatMap(a => cols.map(b => (a.id === b.id ? 0 : between(a, b).length)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `between` deriva de relationsBetween
    [rows, cols, relationsBetween],
  );
  const total = rows.reduce((sum, a) => sum + (rowTotals.get(a.id) ?? 0), 0);

  const entries: MenuEntry[] = cell
    ? [
        ...between(cell.a, cell.b).map<MenuEntry>(r => {
          const schema = getSchema(project, r.typeId);
          const mine = r.sourceId === cell.a.id ? 'source' : 'target';
          return {
            label: `${relationRole(project, r, mine)} → ${nodeLabel(project, cell.b)}`,
            hint: schema?.name,
            icon: ExternalLink,
            leading: <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />,
            onSelect: () => select({ kind: 'relation', id: r.id }, { reveal: true }),
          };
        }),
        ...(between(cell.a, cell.b).length
          ? [{ section: 'Crear otra relación' } as MenuEntry]
          : [{ section: 'Crear relación' } as MenuEntry]),
        ...compatibleRelationTypes(project, cell.a.id, cell.b.id)
          .filter(s => !s.genealogical)
          .map<MenuEntry>(s => ({
            label: `${nodeLabel(project, cell.a)} → ${s.name} → ${nodeLabel(project, cell.b)}`,
            icon: Plus,
            leading: <TypeIcon icon={s.icon} color={s.color} size="sm" />,
            onSelect: () => {
              dispatch({
                type: 'add-relation',
                typeId: s.id,
                sourceId: cell.a.id,
                targetId: cell.b.id,
                id: uid('rel'),
              });
              toast({ message: `Relación «${s.name}» creada`, undoable: true });
              const warning = cardinalityWarning(project, s.id, cell.a.id, cell.b.id);
              if (warning) toast({ message: `Límite superado: ${warning}` });
            },
          })),
        ...compatibleRelationTypes(project, cell.b.id, cell.a.id)
          .filter(s => !s.genealogical && s.directed)
          .map<MenuEntry>(s => ({
            label: `${nodeLabel(project, cell.b)} → ${s.name} → ${nodeLabel(project, cell.a)}`,
            icon: Plus,
            leading: <TypeIcon icon={s.icon} color={s.color} size="sm" />,
            onSelect: () => {
              dispatch({
                type: 'add-relation',
                typeId: s.id,
                sourceId: cell.b.id,
                targetId: cell.a.id,
                id: uid('rel'),
              });
              toast({ message: `Relación «${s.name}» creada`, undoable: true });
              const warning = cardinalityWarning(project, s.id, cell.b.id, cell.a.id);
              if (warning) toast({ message: `Límite superado: ${warning}` });
            },
          })),
      ]
    : [];
  if (cell && entries.length === 1)
    entries.push({
      label: 'Ningún tipo de relación admite este par (el parentesco se crea desde la ficha)',
      onSelect: () => {},
      disabled: true,
    });

  if (!entityTypes.length)
    return <p className="table-empty">Crea primero tipos de entidad y de relación para ver la matriz.</p>;

  return (
    <section className="table-main">
      <div className="workspace-toolbar matrix-toolbar">
        <Grid3x3 size={16} aria-hidden />
        <strong>Matriz</strong>
        <span className="flow-toolbar-label">Filas</span>
        <Select
          compact
          aria-label="Tipo en filas"
          options={entityTypes.map(s => schemaOption(s))}
          value={prefs.rowType}
          onChange={id => id && save({ rowType: id })}
        />
        <span className="flow-toolbar-label">Columnas</span>
        <Select
          compact
          aria-label="Tipo en columnas"
          options={entityTypes.map(s => schemaOption(s))}
          value={prefs.colType}
          onChange={id => id && save({ colType: id })}
        />
        <span className="flow-toolbar-label">Relación</span>
        <Select
          compact
          aria-label="Tipo de relación"
          options={[{ value: '', label: 'Todas' }, ...relationTypes.map(s => schemaOption(s))]}
          value={prefs.relationType ?? ''}
          onChange={id => save({ relationType: id || null })}
        />
        <div className="spacer" />
        <label className="check">
          <input type="checkbox" checked={prefs.hideEmpty} onChange={e => save({ hideEmpty: e.target.checked })} />
          Ocultar vacíos
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.sortByCount} onChange={e => save({ sortByCount: e.target.checked })} />
          Ordenar por nº
        </label>
        <span className="badge">{total} relaciones</span>
      </div>
      <div className="table-scroll">
        {rows.length && cols.length ? (
          <table className="matrix" aria-label="Matriz de relaciones">
            <thead>
              <tr>
                <th className="matrix-corner">
                  <span className="muted">
                    {rowSchema?.name} ↓ · {colSchema?.name} →
                  </span>
                </th>
                {cols.map(b => (
                  <th key={b.id} className="matrix-col">
                    <button
                      type="button"
                      className="matrix-head"
                      title={`${nodeLabel(project, b)} · ${colTotals.get(b.id) ?? 0} relaciones`}
                      onClick={() => select({ kind: 'node', id: b.id }, { reveal: true })}
                    >
                      <span>{nodeLabel(project, b)}</span>
                      <small>{colTotals.get(b.id) ?? 0}</small>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <th className="matrix-row">
                    <button
                      type="button"
                      className="matrix-head"
                      title={`${nodeLabel(project, a)} · ${rowTotals.get(a.id) ?? 0} relaciones`}
                      onClick={() => select({ kind: 'node', id: a.id }, { reveal: true })}
                    >
                      <span>{nodeLabel(project, a)}</span>
                      <small>{rowTotals.get(a.id) ?? 0}</small>
                    </button>
                  </th>
                  {cols.map(b => {
                    if (a.id === b.id) return <td key={b.id} className="matrix-self" aria-hidden />;
                    const rels = between(a, b);
                    return (
                      <td key={b.id}>
                        <button
                          type="button"
                          className={`matrix-cell ${rels.length ? 'filled' : 'empty'}`}
                          style={{ '--heat': rels.length / maxCell } as CSSProperties}
                          aria-label={`${nodeLabel(project, a)} y ${nodeLabel(project, b)}: ${rels.length ? rels.map(r => relationRole(project, r, r.sourceId === a.id ? 'source' : 'target')).join(', ') : 'sin relación'}`}
                          title={
                            rels.length
                              ? rels
                                  .map(
                                    r =>
                                      `${relationRole(project, r, r.sourceId === a.id ? 'source' : 'target')} (${getSchema(project, r.typeId)?.name})`,
                                  )
                                  .join('\n')
                              : 'Sin relación. Pulsa para crear una.'
                          }
                          onClick={event => setCell({ anchor: anchorOf(event.currentTarget), a, b })}
                        >
                          {rels.slice(0, 4).map(r => (
                            <span
                              key={r.id}
                              className="matrix-dot"
                              style={{ background: getSchema(project, r.typeId)?.color }}
                            />
                          ))}
                          {rels.length > 4 && <small>+{rels.length - 4}</small>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="table-empty">
            {prefs.hideEmpty
              ? 'No hay relaciones entre estos tipos con los filtros actuales.'
              : 'No hay nodos de estos tipos todavía.'}
          </p>
        )}
      </div>
      {cell && (
        <Menu anchor={cell.anchor} entries={entries} onClose={() => setCell(null)} label="Relaciones de la celda" />
      )}
    </section>
  );
}
