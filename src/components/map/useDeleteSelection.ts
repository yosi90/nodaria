import { descendants, getNode, nodeLabel, relationLabel } from '../../domain/selectors';
import type { Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useDialogs } from '../common/dialogs';
import { useToast } from '../common/toasts';

/**
 * Elimina el nodo o la relación seleccionados. Solo pide confirmación cuando el borrado
 * arrastra subnodos; en cualquier caso ofrece deshacer.
 */
export function useDeleteSelection() {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const toast = useToast();

  return async (selection: Selection) => {
    if (!selection) return false;
    if (selection.kind === 'relation') {
      const relation = project.relations.find(r => r.id === selection.id);
      if (!relation) return false;
      toast({ message: `Relación «${relationLabel(project, relation)}» eliminada`, undoable: true });
      dispatch({ type: 'delete-relation', id: relation.id });
      return true;
    }
    const node = getNode(project, selection.id);
    if (!node) return false;
    const label = nodeLabel(project, node);
    const nested = descendants(project, node.id).size - 1;
    if (nested > 0) {
      const ok = await confirm({
        title: `Eliminar «${label}»`,
        message: `También se eliminarán sus ${nested} ${nested === 1 ? 'subnodo' : 'subnodos'} y todas sus relaciones.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return false;
    }
    toast({ message: nested ? `«${label}» y ${nested} subnodos eliminados` : `«${label}» eliminado`, undoable: true });
    dispatch({ type: 'delete-node', id: node.id });
    return true;
  };
}
