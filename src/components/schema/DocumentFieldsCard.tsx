import { Braces } from 'lucide-react';
import {
  COLUMN_DESCRIPTION_MAX,
  engineLabel,
  engineOf,
  isEmbeddedType,
  isRelationalEngine,
  tableFields,
  type SqlColumn,
  type TableColumn,
} from '../../domain/database';
import { DOC_TYPES } from '../../domain/dbEngines';
import type { Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { ColumnName } from './ColumnName';

/**
 * Campos de un tipo de MongoDB, Firestore o Neo4j (docs/roadmaps/ROADMAP_NOSQL.md), como «Columnas SQL»
 * para las tablas: el tipo en ese motor (o «Automático», deducido del atributo), la descripción, si es
 * obligatorio, único o con índice y si forma parte del documento. Una referencia a un subdocumento lo
 * incrusta; a otra colección, guarda su id; en Neo4j es una relación. Un atributo propio se cambia en su
 * definición; uno heredado o una preforma, solo en este tipo y sus subtipos.
 */
export function DocumentFieldsCard({ schema }: { schema: Schema }) {
  const { project, dispatch } = useApp();
  const engine = engineOf(project, schema.id);
  if (!engine || isRelationalEngine(engine)) return null;
  const fields = tableFields(project, schema.id);
  const neo4j = engine === 'neo4j';
  const embedded = isEmbeddedType(project, schema.id);
  const set = (column: TableColumn, patch: Partial<SqlColumn>) =>
    dispatch({ type: 'set-column-sql', typeId: schema.id, fieldId: column.field.id, sql: { ...column.sql, ...patch } });
  const title = neo4j
    ? 'Propiedades de Neo4j'
    : embedded
      ? `Campos del subdocumento (${engineLabel(engine)})`
      : `Campos del documento (${engineLabel(engine)})`;
  const inLabel = neo4j ? 'En el nodo' : 'En el documento';

  return (
    <div className="card sql-columns-card">
      <div className="card-head">
        <h3>
          <Braces size={16} aria-hidden /> {title}
        </h3>
      </div>
      <p className="muted-note">
        {neo4j
          ? 'Los atributos son las propiedades de la etiqueta; el título del nodo es su nombre. Las referencias a otra etiqueta son relaciones, como las relaciones del proyecto entre nodos de Neo4j.'
          : engine === 'mongodb'
            ? 'Los atributos son los campos del documento (con su _id); el título del nodo es el nombre de la colección. Una referencia a un subdocumento lo incrusta (una múltiple, como lista); a otra colección, guarda su _id.'
            : 'Los atributos son los campos del documento; el título del nodo es el nombre de la colección, y si cuelga de otra colección, es su subcolección. Una referencia a un subdocumento lo incrusta como mapa (una múltiple, como lista); a otra colección, guarda su referencia.'}{' '}
        Si no eliges tipo, se deduce del atributo. Cambiar aquí una preforma o un atributo heredado solo afecta a este
        tipo y a sus subtipos.
      </p>
      {fields.length ? (
        <div className="sql-grid-scroll">
          <table className="sql-grid">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Tipo</th>
                <th title="Qué guarda el campo. Sin escribir nada vale la descripción del atributo">Descripción</th>
                <th
                  title={
                    neo4j
                      ? 'Debe existir (restricción de existencia, solo en Neo4j Enterprise)'
                      : 'Debe estar en cada documento'
                  }
                >
                  Obligatorio
                </th>
                <th title="Valor único (índice único)">Único</th>
                <th title="Índice sobre el campo">Índice</th>
                <th title={`Forma parte ${neo4j ? 'del nodo' : 'del documento'}`}>{inLabel}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(column => {
                const { field, sql } = column;
                const off = sql.excluded;
                return (
                  <tr key={field.id} className={off ? 'excluded' : ''}>
                    <td>
                      <ColumnName typeId={schema.id} column={column} />
                      {column.reference && (
                        <small>
                          {!column.target
                            ? 'Referencia: elige en el atributo a qué tipo de base de datos apunta'
                            : neo4j
                              ? `Relación → ${column.target.name}`
                              : column.refKind === 'embedded'
                                ? `Incrusta «${column.target.name}»${field.type === 'nodeRefs' ? ' como lista' : ''}`
                                : `Guarda ${field.type === 'nodeRefs' ? 'los ids' : 'el id'} de «${column.target.name}»${
                                    engineOf(project, column.target.id) !== engine
                                      ? ` (${engineLabel(engineOf(project, column.target.id)!)}: otra base)`
                                      : ''
                                  }`}
                        </small>
                      )}
                    </td>
                    <td>
                      {column.reference ? (
                        <code className="doc-type">{column.typeText}</code>
                      ) : (
                        <select
                          className="sql-type-select"
                          aria-label={`${field.label}: tipo`}
                          value={column.docDeduced ? '' : column.docType}
                          disabled={off}
                          onChange={event => set(column, { docType: event.target.value || undefined })}
                        >
                          <option value="">Automático ({column.docDeduced ? column.docType : '…'})</option>
                          {DOC_TYPES[engine].map(type => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <input
                        className="sql-description"
                        aria-label={`${field.label}: descripción`}
                        value={sql.description ?? ''}
                        placeholder={field.description || 'Qué guarda'}
                        maxLength={COLUMN_DESCRIPTION_MAX}
                        disabled={off}
                        onChange={event => set(column, { description: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: obligatorio`}
                        checked={!sql.nullable}
                        disabled={off}
                        onChange={event => set(column, { nullable: !event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: único`}
                        checked={sql.unique}
                        disabled={off || column.refKind === 'embedded'}
                        onChange={event => set(column, { unique: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: índice`}
                        checked={Boolean(sql.indexed)}
                        disabled={off || column.refKind === 'embedded'}
                        onChange={event => set(column, { indexed: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${field.label}: ${inLabel.toLowerCase()}`}
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
        <p className="empty-copy">Añade atributos al tipo: cada uno será un campo.</p>
      )}
    </div>
  );
}
