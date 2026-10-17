import { descendants } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { useDialogs } from '../common/dialogs';
import { useToast } from '../common/toasts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Elimina varios nodos de una vez, confirmando antes, con sus subnodos y relaciones; se puede deshacer. */
export function useRemoveNodes() {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const toast = useToast();
  return async (ids: string[]) => {
    const all = new Set<string>();
    ids.forEach(id => descendants(project, id).forEach(d => all.add(d)));
    const nested = all.size - ids.length;
    const ok = await confirm({
      title: `Eliminar ${plural(ids.length, 'nodo', 'nodos')}`,
      message: nested
        ? `Se eliminarán con sus ${plural(nested, 'subnodo', 'subnodos')} y todas sus relaciones. Puedes deshacerlo después.`
        : 'Se eliminarán con sus relaciones. Puedes deshacerlo después.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return false;
    dispatch({ type: 'delete-nodes', ids });
    toast({ message: `${plural(ids.length, 'nodo eliminado', 'nodos eliminados')}`, undoable: true });
    return true;
  };
}
