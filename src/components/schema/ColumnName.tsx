import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { sqlOverrideOwner, type TableColumn } from '../../domain/database';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';

/**
 * El nombre de una columna (`SqlColumnsCard`) o de un campo (`DocumentFieldsCard`) con de dónde viene el
 * atributo y dónde están sus ajustes: en este tipo (con el botón para volver a los heredados) o en otro.
 * `before` va delante del nombre (la llave de la clave primaria).
 */
export function ColumnName({ typeId, column, before }: { typeId: string; column: TableColumn; before?: ReactNode }) {
  const { project, dispatch } = useApp();
  const { field } = column;
  const owner = column.origin.kind === 'own' ? undefined : sqlOverrideOwner(project, typeId, field.id);
  return (
    <div className="sql-name">
      {before}
      <code>{field.key || field.label}</code>
      {column.origin.kind === 'library' && <span className="badge accent">Preforma</span>}
      {column.origin.kind === 'inherited' && <span className="badge">De «{column.origin.from.name}»</span>}
      {field.isTitle && <span className="badge accent">Título</span>}
      {owner?.id === typeId && (
        <>
          <span className="badge warning">Ajustado en este tipo</span>
          <IconButton
            icon={RotateCcw}
            size="sm"
            label="Volver a los ajustes heredados"
            onClick={() => dispatch({ type: 'set-column-sql', typeId, fieldId: field.id, sql: null })}
          />
        </>
      )}
      {owner && owner.id !== typeId && <span className="badge">Ajustado en «{owner.name}»</span>}
    </div>
  );
}
