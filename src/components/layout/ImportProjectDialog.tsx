import { useMemo, useState } from 'react';
import { mergeProject } from '../../domain/projectMerge';
import type { Project } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * Importar un JSON con vista previa (PENDIENTES.md, Fase 7): como proyecto nuevo o fusionado en el
 * actual (`projectMerge.ts`), con o sin sus tipos y atributos nuevos. La fusión se deshace en un paso.
 */
export function ImportProjectDialog({
  imported,
  issues,
  onClose,
}: {
  imported: Project;
  issues: string[];
  onClose: () => void;
}) {
  const { project, dispatch, reportRepairs } = useApp();
  const { canEdit, canEditSchema } = useProjectAccess();
  const toast = useToast();
  const [mode, setMode] = useState<'new' | 'merge'>('new');
  const [withSchema, setWithSchema] = useState(canEditSchema);
  const schema = withSchema && canEditSchema;
  const merge = useMemo(
    () => (mode === 'merge' ? mergeProject(project, imported, { schema }) : null),
    [mode, project, imported, schema],
  );
  const changes = merge ? merge.nodes + merge.relations + merge.newTypes + merge.newFields : 0;

  return (
    <Modal
      title={`Importar «${imported.name}»`}
      submitLabel={mode === 'new' ? 'Crear proyecto' : 'Fusionar'}
      submitDisabled={mode === 'merge' && !changes}
      onClose={onClose}
      onSubmit={() => {
        if (mode === 'new') {
          dispatch({ type: 'import-project', project: imported });
          toast({ message: `Proyecto «${imported.name}» importado` });
          if (issues.length) reportRepairs({ projectName: imported.name, issues });
        } else {
          dispatch({ type: schema ? 'merge-project' : 'merge-project-data', source: imported });
          toast({ message: `«${imported.name}» fusionado en «${project.name}».`, undoable: true });
        }
        onClose();
      }}
    >
      <div className="form-grid">
        <p className="muted-note">
          {count(imported.schemas.length, 'tipo', 'tipos')}, {count(imported.nodes.length, 'nodo', 'nodos')} y{' '}
          {count(imported.relations.length, 'relación', 'relaciones')}.
          {issues.length > 0 &&
            ` Al leerlo se ${issues.length === 1 ? 'corrigió 1 problema' : `corrigieron ${issues.length} problemas`}.`}
        </p>
        <fieldset className="choice-group">
          <legend>¿Dónde lo importamos?</legend>
          <label>
            <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Como proyecto nuevo
          </label>
          <label>
            <input type="radio" checked={mode === 'merge'} disabled={!canEdit} onChange={() => setMode('merge')} />{' '}
            Fusionarlo en «{project.name}»
          </label>
        </fieldset>
        {mode === 'merge' && merge && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={schema}
                disabled={!canEditSchema}
                onChange={e => setWithSchema(e.target.checked)}
              />{' '}
              Añadir también sus tipos y atributos que aquí no están
            </label>
            {!canEditSchema && (
              <p className="muted-note">Tu rol en el grupo no te deja cambiar el esquema: solo se añaden datos.</p>
            )}
            <ul className="muted-note">
              {schema && (
                <li>
                  {count(merge.newTypes, 'tipo nuevo', 'tipos nuevos')} y{' '}
                  {count(merge.newFields, 'atributo nuevo', 'atributos nuevos')} en tipos que ya están.
                </li>
              )}
              <li>
                {count(merge.nodes, 'nodo nuevo', 'nodos nuevos')} y{' '}
                {count(merge.relations, 'relación nueva', 'relaciones nuevas')}.
              </li>
              {merge.existing > 0 && (
                <li>
                  {merge.existing === 1 ? '1 nodo ya está' : `${merge.existing} nodos ya están`} en el proyecto: se
                  conserva la versión de aquí.
                </li>
              )}
              {merge.sameTitle > 0 && (
                <li>
                  {merge.sameTitle === 1
                    ? '1 nodo nuevo tiene el mismo título que uno de aquí'
                    : `${merge.sameTitle} nodos nuevos tienen el mismo título que uno de aquí`}
                  : revisa si son duplicados.
                </li>
              )}
              {merge.skippedNodes + merge.skippedRelations > 0 && (
                <li>
                  Se omiten {count(merge.skippedNodes, 'nodo', 'nodos')} y{' '}
                  {count(merge.skippedRelations, 'relación', 'relaciones')} de tipos que aquí no están o con un extremo
                  que no se importa.
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
