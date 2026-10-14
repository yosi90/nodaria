import { candidateKeys, createDatabaseTable, emptyDatabaseDesign } from '../../domain/databaseDesign';
import { nodeLabel } from '../../domain/selectors';
import { uid } from '../../domain/factories';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { TableEditor } from './TableEditor';
import { ForeignKeyEditor } from './ForeignKeyEditor';

export function DatabaseNodeEditor({
  nodeId,
  foreignKey,
  onClose,
}: {
  nodeId: string;
  foreignKey: boolean;
  onClose: () => void;
}) {
  const { project, dispatch } = useApp();
  const { databaseForeignKeyId } = useNavigation();
  const node = project.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const design = project.databaseDesign ?? emptyDatabaseDesign();
  const table = design.tables.find(t => t.id === nodeId);
  if (foreignKey && table) {
    const target = design.tables.find(t => t.id !== nodeId) ?? table;
    const columns = candidateKeys(target)[0] ?? [];
    const initial = design.foreignKeys.find(fk => fk.id === databaseForeignKeyId) ?? {
      id: uid('fk'),
      name: `FK_${table.name}`,
      sourceTableId: nodeId,
      sourceColumnIds: columns.map(() => ''),
      targetTableId: target.id,
      targetColumnIds: columns,
    };
    return (
      <ForeignKeyEditor
        initial={initial}
        design={design}
        onClose={onClose}
        onSave={foreignKey => {
          dispatch({ type: 'database-edit', edit: { kind: 'save-fk', foreignKey } });
          onClose();
        }}
      />
    );
  }
  const initial = table ?? { ...createDatabaseTable(), id: nodeId, name: nodeLabel(project, node).slice(0, 128) };
  return (
    <TableEditor
      initial={initial}
      design={design}
      project={project}
      onClose={onClose}
      onSave={table => {
        dispatch({ type: 'database-edit', edit: { kind: 'save-table', table } });
        onClose();
      }}
    />
  );
}
