import { ChevronLeft, ChevronRight, Copy, KeyRound, Link2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { columnTypeText, engineLabel } from '../../domain/database';
import { uid } from '../../domain/factories';
import {
  MAX_ROWS,
  issueCount,
  parseGrid,
  rowsOf,
  valueKind,
  type CellValue,
  type DataColumn,
  type DataTable,
  type RowIssues,
  type TableRow,
} from '../../domain/tableData';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { useToast } from '../common/toasts';
import { withMember } from '../common/sets';

/** Filas por página: la hoja edita en celda y miles de controles a la vez irían lentos. */
const PAGE = 100;

interface Props {
  table: DataTable;
  tables: DataTable[];
  issues: RowIssues;
  canEdit: boolean;
}

/** Qué se ve de un valor guardado en la celda. */
const shown = (value: CellValue | undefined) => (value === null || value === undefined ? '' : String(value));

/** Los valores que admite una clave foránea: las claves de la tabla destino, con su primer texto. */
function useForeignOptions(table: DataTable, tables: DataTable[]) {
  const { project } = useApp();
  return useMemo(() => {
    const out = new Map<string, { value: string; label: string }[]>();
    table.columns.forEach(c => {
      if (!c.fk || c.targetKey) return;
      const target = tables.find(t => t.node.id === c.fk!.nodeId);
      if (!target) return;
      const text = target.columns.find(t => !t.sql.primaryKey && !t.fk && valueKind(t) === 'text');
      out.set(
        c.key,
        rowsOf(project, target.node.id)
          .filter(r => shown(r.cells[c.fk!.key]))
          .map(r => {
            const value = shown(r.cells[c.fk!.key]);
            const extra = text ? shown(r.cells[text.key]) : '';
            return { value, label: extra ? `${value} · ${extra}` : value };
          }),
      );
    });
    return out;
  }, [project, table, tables]);
}

export function RecordsGrid({ table, tables, issues, canEdit }: Props) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const rows = rowsOf(project, table.node.id);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, (current + 1) * PAGE);
  const foreign = useForeignOptions(table, tables);
  const nodeId = table.node.id;
  const selected = rows.filter(r => checked.has(r.id)).map(r => r.id);
  const errors = issueCount(issues);

  /** Lleva el foco a una celda de la hoja (fila por posición en la tabla entera). */
  const focusCell = (rowIndex: number, colIndex: number) => {
    const targetPage = Math.floor(rowIndex / PAGE);
    if (targetPage !== current) setPage(targetPage);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`.records-grid [data-cell="${rowIndex}:${colIndex}"]`)
        ?.focus({ preventScroll: false }),
    );
  };

  const addRow = (afterId?: string) => {
    const id = uid('row');
    dispatch({ type: 'add-table-rows', nodeId, ids: [id], afterId });
    const index = afterId ? rows.findIndex(r => r.id === afterId) + 1 : rows.length;
    focusCell(index, 0);
  };
  const setCell = (row: TableRow, column: DataColumn, value: CellValue) => {
    if ((row.cells[column.key] ?? null) === value) return;
    dispatch({ type: 'set-table-cell', nodeId, rowId: row.id, key: column.key, value });
  };
  const remove = () => {
    dispatch({ type: 'remove-table-rows', nodeId, rowIds: selected });
    toast({ message: selected.length === 1 ? 'Fila borrada' : `${selected.length} filas borradas`, undoable: true });
    setChecked(new Set());
  };
  const duplicate = () => {
    dispatch({ type: 'duplicate-table-rows', nodeId, rowIds: selected });
    toast({
      message: selected.length === 1 ? 'Fila duplicada' : `${selected.length} filas duplicadas`,
      undoable: true,
    });
  };

  /** Pegar varias celdas (con tabuladores o saltos de línea) rellena la hoja; una sola se pega en la celda. */
  const onPaste = (event: ClipboardEvent, row: TableRow | null, column: DataColumn, always = false) => {
    const text = event.clipboardData.getData('text/plain');
    if (!always && !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    event.preventDefault();
    const grid = parseGrid(text);
    if (!grid.length) return;
    dispatch({ type: 'paste-table-cells', nodeId, rowId: row?.id ?? null, key: column.key, grid });
    toast({ message: `${grid.length} ${grid.length === 1 ? 'fila pegada' : 'filas pegadas'}`, undoable: true });
  };

  const allChecked = visible.length > 0 && visible.every(r => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set([...checked, ...visible.map(r => r.id)]));

  return (
    <section className="table-main records-main" aria-label={`Filas de ${table.name}`}>
      <div className="workspace-toolbar">
        <strong>{table.name}</strong>
        <span className="badge">{rows.length}</span>
        <span className="muted-note">{engineLabel(table.dialect)}</span>
        {errors > 0 && (
          <span className="records-errors" role="status">
            <TriangleAlert size={14} aria-hidden /> {errors === 1 ? '1 error' : `${errors} errores`}
          </span>
        )}
        <div className="spacer" />
        {canEdit && selected.length > 0 && (
          <>
            <Button size="sm" icon={Copy} onClick={duplicate}>
              Duplicar ({selected.length})
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={remove}>
              Borrar ({selected.length})
            </Button>
          </>
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            disabled={rows.length >= MAX_ROWS}
            title={rows.length >= MAX_ROWS ? `Una tabla admite ${MAX_ROWS} filas` : undefined}
            onClick={() => addRow()}
          >
            Añadir fila
          </Button>
        )}
      </div>
      <div className="table-scroll">
        {!table.columns.length ? (
          <p className="empty-copy">Esta tabla no tiene columnas. Añádelas como atributos de su tipo.</p>
        ) : (
          <>
            <table className="data-table records-grid" aria-label={`Filas de ${table.name}`}>
              <thead>
                <tr>
                  <th className="cell-check">
                    <input
                      type="checkbox"
                      aria-label={allChecked ? 'Desmarcar las filas' : 'Marcar las filas de esta página'}
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="records-number" aria-label="Número de fila">
                    #
                  </th>
                  {table.columns.map(c => (
                    <th key={c.key} title={c.fk ? `Apunta a ${foreignName(tables, c)}` : undefined}>
                      <span className="records-head">
                        <span className="records-head-name">
                          {c.sql.primaryKey && <KeyRound size={12} aria-label="Clave primaria" />}
                          {c.fk && <Link2 size={12} aria-label="Clave foránea" />}
                          {c.name}
                        </span>
                        <small>
                          {columnTypeText(c.type)}
                          {c.sql.identity ? ' · auto' : ''}
                          {c.fk ? ` → ${foreignName(tables, c)}` : ''}
                        </small>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const index = current * PAGE + i;
                  const rowIssues = issues.get(row.id);
                  return (
                    <tr key={row.id} className={checked.has(row.id) ? 'checked' : ''}>
                      <td className="cell-check">
                        <input
                          type="checkbox"
                          aria-label={`Marcar la fila ${index + 1}`}
                          checked={checked.has(row.id)}
                          onChange={e => setChecked(withMember(checked, row.id, e.target.checked))}
                        />
                      </td>
                      <td className="records-number">{index + 1}</td>
                      {table.columns.map((c, j) => (
                        <Cell
                          key={c.key}
                          column={c}
                          value={row.cells[c.key] ?? null}
                          error={rowIssues?.get(c.key)}
                          options={foreign.get(c.key)}
                          address={`${index}:${j}`}
                          label={`${c.name}, fila ${index + 1}`}
                          disabled={!canEdit}
                          onChange={value => setCell(row, c, value)}
                          onPaste={event => onPaste(event, row, c)}
                          onNext={() => (index + 1 < rows.length ? focusCell(index + 1, j) : addRow())}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <>
                <p className="empty-copy">
                  Sin filas todavía. Añade una o pega desde una hoja de cálculo (Excel, un CSV): las columnas van en el
                  orden de la hoja.
                </p>
                {canEdit && (
                  <div className="records-paste">
                    <input
                      value=""
                      readOnly
                      placeholder="Pega aquí las filas (Ctrl+V)"
                      aria-label="Pegar filas desde una hoja de cálculo"
                      onPaste={event => onPaste(event, null, table.columns[0], true)}
                    />
                  </div>
                )}
              </>
            )}
            {pages > 1 && (
              <div className="records-pager">
                <IconButton
                  icon={ChevronLeft}
                  size="sm"
                  label="Página anterior"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                />
                <span>
                  Filas {current * PAGE + 1}–{Math.min(rows.length, (current + 1) * PAGE)} de {rows.length}
                </span>
                <IconButton
                  icon={ChevronRight}
                  size="sm"
                  label="Página siguiente"
                  disabled={current >= pages - 1}
                  onClick={() => setPage(current + 1)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const foreignName = (tables: DataTable[], c: DataColumn) => tables.find(t => t.node.id === c.fk?.nodeId)?.name ?? '';

interface CellProps {
  column: DataColumn;
  value: CellValue;
  error?: string;
  options?: { value: string; label: string }[];
  address: string;
  label: string;
  disabled: boolean;
  onChange: (value: CellValue) => void;
  onPaste: (event: ClipboardEvent) => void;
  onNext: () => void;
}

/**
 * Una celda. Los textos se guardan al salir de la celda o con Intro (que baja a la siguiente fila), no en
 * cada pulsación: así «12,5» o «31/12/2026» no se normalizan a medio escribir. Escape deshace lo escrito.
 */
function Cell({ column, value, error, options, address, label, disabled, onChange, onPaste, onNext }: CellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const kind = valueKind(column);
  const placeholder = column.sql.identity
    ? 'auto'
    : column.sql.defaultValue
      ? `= ${column.sql.defaultValue}`
      : column.sql.nullable && !column.sql.primaryKey
        ? 'NULL'
        : '';
  const common = {
    'data-cell': address,
    'aria-label': label,
    'aria-invalid': error ? true : undefined,
    title: error,
    disabled,
  } as const;
  const listOptions =
    options ??
    (column.field.type === 'select' && kind === 'text'
      ? column.field.options.map(o => ({ value: o, label: o }))
      : null);

  let control;
  if (kind === 'bool') {
    control = (
      <select
        {...common}
        value={value === true ? '1' : value === false ? '0' : ''}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value === '1')}
      >
        <option value="">{placeholder || '—'}</option>
        <option value="1">Sí (1)</option>
        <option value="0">No (0)</option>
      </select>
    );
  } else if (listOptions) {
    const current = shown(value);
    control = (
      <select {...common} value={current} onChange={e => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">{placeholder || '—'}</option>
        {current && !listOptions.some(o => o.value === current) && <option value={current}>{current}</option>}
        {listOptions.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    const commit = () => {
      if (draft === null) return;
      onChange(draft === '' ? null : draft);
      setDraft(null);
    };
    control = (
      <input
        {...common}
        value={draft ?? shown(value)}
        placeholder={placeholder}
        inputMode={kind === 'integer' || kind === 'exact' || kind === 'float' ? 'decimal' : undefined}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onPaste={onPaste}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            onNext();
          } else if (event.key === 'Escape' && draft !== null) {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
          }
        }}
      />
    );
  }
  return <td className={`records-cell ${error ? 'invalid' : ''} kind-${kind}`}>{control}</td>;
}
