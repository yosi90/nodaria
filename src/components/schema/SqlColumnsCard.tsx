import { CircleAlert, Database, KeyRound, Network, RotateCcw, TriangleAlert, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { junctionProposals } from '../../domain/junctionTables';
import { JunctionTablesDialog } from './JunctionTablesDialog';
import {
  allowsIdentity,
  COLUMN_DESCRIPTION_MAX,
  FK_ACTIONS,
  type FkAction,
  allowsMax,
  hasLength,
  hasPrecision,
  hasTimeScale,
  convertType,
  dialectOf,
  referencedTable,
  sqlAnnotations,
  sqlOverrideOwner,
  sqlType,
  sqlTypeText,
  tableFields,
  tableIssues,
  columnTypeText,
  typeOptionLabel,
  typesOf,
  type SqlColumn,
  type SqlDialect,
  type SqlDataType,
  type SqlTypeName,
  type TableColumn,
} from '../../domain/database';
import type { Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { Button, IconButton } from '../common/Button';
import { useToast } from '../common/toasts';

/**
 * Columnas SQL de un tipo tabla (SQL Server o Db2 for i), como el diseñador de tablas: todos sus atributos
 * efectivos (propios, preformas y heredados) con su tipo, clave primaria, nulos, UNIQUE e IDENTITY.
 * Un atributo propio se cambia en su definición; uno heredado o una preforma, solo en este tipo y sus
 * subtipos (`Schema.sqlOverrides`), sin tocar al padre ni a los demás tipos que usan la preforma.
 */
export function SqlColumnsCard({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const { openHelp } = useNavigation();
  const fields = tableFields(project, schema.id);
  const issues = tableIssues(project, schema.id);
  const dialect: SqlDialect = dialectOf(project, schema.id) ?? 'sqlserver';
  const db2 = dialect === 'db2i';
  // Referencias múltiples hacia otras tablas: se ofrecen como tablas intermedias (hito 4).
  const junctions = junctionProposals(project, { typeId: schema.id }).length;
  const [junctionOpen, setJunctionOpen] = useState(false);
  // Las anotaciones se convierten en todas las tablas a la vez: suelen repetirse en preformas y herencia.
  const annotations = sqlAnnotations(project);
  const set = (column: TableColumn, patch: Partial<SqlColumn>) =>
    dispatch({
      type: 'set-column-sql',
      typeId: schema.id,
      fieldId: column.field.id,
      sql: { ...column.sql, ...patch },
    });

  return (
    <div className="card sql-columns-card">
      <div className="card-head">
        <h3>
          <Database size={16} aria-hidden /> Columnas SQL{db2 ? ' · Db2 for i' : ''}
        </h3>
        {annotations.length > 0 && (
          <Button
            size="sm"
            icon={Wand2}
            title={annotations.map(a => `${a.field.label}: «${a.text}» → ${sqlTypeText(a.type)}`).join('\n')}
            onClick={() => {
              dispatch({ type: 'apply-sql-annotations' });
              toast({
                message: `${annotations.length} ${annotations.length === 1 ? 'anotación convertida' : 'anotaciones convertidas'} en tipo SQL en las tablas`,
                undoable: true,
              });
            }}
          >
            Usar {annotations.length} {annotations.length === 1 ? 'anotación' : 'anotaciones'} de las tablas como tipo
            SQL
          </Button>
        )}
      </div>
      <p className="muted-note">
        Los atributos son las columnas; el título del nodo es el nombre de la tabla. Si no eliges tipo, se deduce del
        atributo, y una referencia a otra tabla toma el de su clave primaria y se dibuja como clave foránea. Cambiar
        aquí una preforma o un atributo heredado solo afecta a este tipo y a sus subtipos.{' '}
        <button type="button" className="link-button" onClick={() => openHelp('database')}>
          Guía de bases de datos
        </button>
      </p>
      {junctions > 0 && (
        <p className="sql-junctions">
          <Button size="sm" icon={Network} onClick={() => setJunctionOpen(true)}>
            Proponer {junctions === 1 ? 'una tabla intermedia' : `${junctions} tablas intermedias`}
          </Button>
          <span className="field-hint">
            para las referencias múltiples a otras tablas (relaciones muchos a muchos).
          </span>
        </p>
      )}
      {junctionOpen && <JunctionTablesDialog typeId={schema.id} onClose={() => setJunctionOpen(false)} />}
      {issues.length > 0 && (
        <ul className="sql-issues">
          {issues.map(issue => (
            <li key={issue.message} className={issue.severity}>
              {issue.severity === 'error' ? (
                <CircleAlert size={13} aria-hidden />
              ) : (
                <TriangleAlert size={13} aria-hidden />
              )}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {fields.length ? (
        <div className="sql-grid-scroll">
          <table className="sql-grid">
            <thead>
              <tr>
                <th>Columna</th>
                <th>Tipo SQL</th>
                <th title="Qué guarda la columna. Sin escribir nada vale la descripción del atributo; si alguna columna tiene, la tabla del diagrama la enseña">
                  Descripción
                </th>
                <th title="Clave primaria">PK</th>
                <th title="Admite nulos">Nulos</th>
                <th title="Valor único (UNIQUE)">Único</th>
                <th title="UNIQUE compuesta: las columnas con el mismo nombre de grupo forman una sola restricción">
                  Grupo único
                </th>
                <th
                  title={
                    db2 ? 'Numeración automática GENERATED ALWAYS AS IDENTITY' : 'Numeración automática IDENTITY(1,1)'
                  }
                >
                  Identity
                </th>
                <th
                  title={
                    db2
                      ? "Valor por defecto: una expresión de Db2 for i, como 0, 'texto' o CURRENT_TIMESTAMP"
                      : "Valor por defecto: una expresión de SQL Server, como 0, N'texto' o GETDATE()"
                  }
                >
                  Por defecto
                </th>
                <th title="Índice sobre la columna (CREATE INDEX)">Índice</th>
                <th title="Forma parte de la tabla">En la tabla</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(column => {
                const { field, sql } = column;
                const target = field.type === 'nodeRef' ? referencedTable(project, field) : undefined;
                const off = sql.excluded;
                return (
                  <tr key={field.id} className={off ? 'excluded' : ''}>
                    <td>
                      <div className="sql-name">
                        {sql.primaryKey && !off && <KeyRound size={12} aria-label="Clave primaria" />}
                        <code>{field.key || field.label}</code>
                        {column.origin.kind === 'library' && <span className="badge accent">Preforma</span>}
                        {column.origin.kind === 'inherited' && (
                          <span className="badge">De «{column.origin.from.name}»</span>
                        )}
                        {field.isTitle && <span className="badge accent">Título</span>}
                        {(() => {
                          const owner =
                            column.origin.kind === 'own' ? undefined : sqlOverrideOwner(project, schema.id, field.id);
                          if (!owner) return null;
                          return owner.id === schema.id ? (
                            <>
                              <span className="badge warning">Ajustado en este tipo</span>
                              <IconButton
                                icon={RotateCcw}
                                size="sm"
                                label="Volver a los ajustes heredados"
                                onClick={() =>
                                  dispatch({ type: 'set-column-sql', typeId: schema.id, fieldId: field.id, sql: null })
                                }
                              />
                            </>
                          ) : (
                            <span className="badge">Ajustado en «{owner.name}»</span>
                          );
                        })()}
                      </div>
                      {field.type === 'nodeRef' && (
                        <small>
                          {target
                            ? `Clave foránea → ${target.name}`
                            : 'Referencia: es clave foránea si apunta a una tabla'}
                        </small>
                      )}
                      {field.type === 'nodeRef' && target && !off && (
                        <div className="sql-fk-actions">
                          {(
                            [
                              ['onDelete', 'Al borrar'],
                              ['onUpdate', 'Al actualizar'],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <select
                                aria-label={`${field.label}: ${label.toLowerCase()} la fila referenciada`}
                                value={sql[key] ?? 'NO ACTION'}
                                onChange={event => set(column, { [key]: event.target.value as FkAction })}
                              >
                                {/* Db2 solo admite NO ACTION (o RESTRICT) al actualizar la fila referenciada. */}
                                {(db2 && key === 'onUpdate' ? (['NO ACTION'] as const) : FK_ACTIONS).map(action => (
                                  <option key={action} value={action}>
                                    {action}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      )}
                      {field.type === 'nodeRefs' && <small>Referencia múltiple: necesita una tabla intermedia</small>}
                    </td>
                    <td>
                      <SqlTypeEditor
                        dialect={dialect}
                        type={sql.type && convertType(sql.type, dialect)}
                        deduced={column.type}
                        disabled={off}
                        onChange={type => set(column, { type })}
                      />
                    </td>
                    <td>
                      <input
                        className="sql-description"
                        aria-label={`${field.label}: descripción`}
                        value={sql.description ?? ''}
                        placeholder={field.description || 'Qué guarda'}
                        title={
                          sql.description
                            ? undefined
                            : field.description
                              ? 'La del atributo; escribe otra para esta tabla'
                              : undefined
                        }
                        maxLength={COLUMN_DESCRIPTION_MAX}
                        disabled={off}
                        onChange={event => set(column, { description: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: clave primaria`}
                        checked={sql.primaryKey}
                        disabled={off}
                        onChange={event => set(column, { primaryKey: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: admite nulos`}
                        checked={sql.nullable}
                        disabled={off || sql.primaryKey}
                        onChange={event => set(column, { nullable: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: único`}
                        checked={sql.unique}
                        disabled={off}
                        onChange={event => set(column, { unique: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        className="sql-default"
                        aria-label={`${field.label}: grupo único`}
                        value={sql.uniqueGroup ?? ''}
                        placeholder="—"
                        maxLength={60}
                        disabled={off}
                        onChange={event => set(column, { uniqueGroup: event.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: identity`}
                        checked={sql.identity}
                        disabled={off || (!sql.identity && !allowsIdentity(column.type.name))}
                        onChange={event => set(column, { identity: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        className="sql-default"
                        aria-label={`${field.label}: valor por defecto`}
                        value={sql.defaultValue ?? ''}
                        placeholder="—"
                        disabled={off || sql.identity}
                        onChange={event => set(column, { defaultValue: event.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: índice`}
                        checked={Boolean(sql.indexed)}
                        disabled={off}
                        onChange={event => set(column, { indexed: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: forma parte de la tabla`}
                        checked={!off}
                        onChange={event => set(column, { excluded: !event.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-copy">Añade atributos al tipo: cada uno será una columna.</p>
      )}
    </div>
  );
}

/** Tipo SQL de una columna: «Automático» (deducido) o uno elegido, con su longitud o precisión. */
function SqlTypeEditor({
  dialect,
  type,
  deduced,
  disabled,
  onChange,
}: {
  dialect: SqlDialect;
  type: SqlDataType | null;
  deduced: SqlDataType;
  disabled: boolean;
  onChange: (type: SqlDataType | null) => void;
}) {
  const number = (value: string) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  };
  return (
    <div className="sql-type">
      <select
        aria-label="Tipo SQL"
        value={type?.name ?? ''}
        disabled={disabled}
        onChange={event => {
          const name = event.target.value as SqlTypeName | '';
          onChange(name ? sqlType(name, hasLength(name) && type && hasLength(type.name) ? type.length : null) : null);
        }}
      >
        <option value="">Automático · {columnTypeText(deduced)}</option>
        {typesOf(dialect).map(name => (
          <option key={name} value={name}>
            {typeOptionLabel(name)}
          </option>
        ))}
      </select>
      {type && hasLength(type.name) && (
        <input
          aria-label="Longitud"
          className="sql-size"
          value={type.length ?? ''}
          placeholder={allowsMax(type.name) ? 'n o max' : 'n'}
          disabled={disabled}
          onChange={event => {
            const raw = event.target.value.trim().toLowerCase();
            onChange({ ...type, length: raw === 'max' && allowsMax(type.name) ? 'max' : number(raw) });
          }}
        />
      )}
      {type && hasPrecision(type.name) && (
        <>
          <input
            aria-label="Precisión"
            className="sql-size"
            type="number"
            min={1}
            max={dialect === 'db2i' ? 63 : 38}
            value={type.precision ?? ''}
            disabled={disabled}
            onChange={event => onChange({ ...type, precision: number(event.target.value) })}
          />
          <input
            aria-label="Escala"
            className="sql-size"
            type="number"
            min={0}
            max={dialect === 'db2i' ? 63 : 38}
            value={type.scale ?? ''}
            disabled={disabled}
            onChange={event => onChange({ ...type, scale: number(event.target.value) })}
          />
        </>
      )}
      {type && hasTimeScale(type.name) && (
        <input
          aria-label="Fracciones de segundo"
          className="sql-size"
          type="number"
          min={0}
          max={type.name === 'TIMESTAMP' ? 12 : 7}
          value={type.scale ?? ''}
          disabled={disabled}
          onChange={event => onChange({ ...type, scale: number(event.target.value) })}
        />
      )}
    </div>
  );
}
