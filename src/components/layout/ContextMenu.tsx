import { useCallback, useEffect, useState } from 'react';
import { Plus, Shapes, Undo2, Redo2, Copy, Trash2 } from 'lucide-react';
import { getNode, getSchema, creatableTypes } from '../../domain/selectors';
import { uid } from '../../domain/factories';
import { useApp } from '../../state/AppContext';
import { useNavigation, type View } from '../../state/navigation';
import { Menu, type MenuEntry } from '../common/Menu';
import { pointAnchor } from '../common/anchor';
import { useDeleteSelection } from '../map/useDeleteSelection';
import { afterViewMount, openSchemaDefinition } from './schemaNavigation';

export function ContextMenu() {
  const { project, dispatch, undo, redo, canUndo, canRedo } = useApp();
  const { setView, select, view } = useNavigation();
  const remove = useDeleteSelection();
  const [context, setContext] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const close = useCallback(() => setContext(null), []);
  useEffect(() => {
    const show = (target: EventTarget | null, x: number, y: number) => {
      if (
        !(target instanceof Element) ||
        target.closest('input, textarea, select, a, [contenteditable="true"], [role="menu"]') ||
        document.querySelector('dialog[open]') ||
        document.getSelection()?.toString()
      )
        return false;
      const id = target.closest<HTMLElement>('[data-node], .react-flow__node')?.dataset;
      setContext({ x, y, nodeId: id?.node ?? id?.id ?? null });
      return true;
    };
    const pointer = (event: MouseEvent) => {
      if (show(event.target, event.clientX, event.clientY)) event.preventDefault();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      const rect = document.activeElement?.getBoundingClientRect();
      if (show(document.activeElement, rect ? rect.x + rect.width / 2 : 100, rect ? rect.y + rect.height / 2 : 100))
        event.preventDefault();
    };
    window.addEventListener('contextmenu', pointer);
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('contextmenu', pointer);
      window.removeEventListener('keydown', keyboard);
    };
  }, []);
  if (!context) return null;
  const node = context.nodeId ? getNode(project, context.nodeId) : undefined;
  const type = node ? getSchema(project, node.typeId) : undefined;
  const views: [View, string][] = [
    ['map', 'Mapa'],
    ['table', 'Tabla'],
    ['health', 'Salud'],
    ['schema', 'Tipos'],
    ['relations', 'Relaciones'],
    ['properties', 'Propiedades'],
  ];
  const entries: MenuEntry[] = [
    ...(node
      ? [
          { label: 'Abrir ficha', onSelect: () => select({ kind: 'node', id: node.id }, { reveal: true }) },
          {
            label: 'Definición del tipo',
            icon: Shapes,
            disabled: !type,
            onSelect: () => {
              if (type) openSchemaDefinition(type.id, type.kind, setView);
            },
          },
          {
            label: 'Duplicar nodo',
            icon: Copy,
            onSelect: () => {
              const id = uid('node');
              dispatch({ type: 'duplicate-node', id: node.id, newId: id });
              select({ kind: 'node', id }, { reveal: true });
            },
          },
          {
            label: 'Eliminar nodo',
            icon: Trash2,
            danger: true,
            onSelect: () => {
              void remove({ kind: 'node', id: node.id });
            },
          },
          'separator' as const,
        ]
      : []),
    {
      label: 'Nuevo nodo',
      icon: Plus,
      disabled: !creatableTypes(project, null).length,
      onSelect: () => {
        setView('map');
        afterViewMount(() =>
          window.dispatchEvent(new CustomEvent('nodaria-create-node', { detail: { x: context.x, y: context.y } })),
        );
      },
    },
    {
      label: 'Nuevo tipo',
      icon: Shapes,
      onSelect: () => {
        setView('schema');
        afterViewMount(() => document.querySelector<HTMLButtonElement>('[aria-label="Crear tipo"]')?.click());
      },
    },
    'separator',
    { label: 'Deshacer', icon: Undo2, disabled: !canUndo, onSelect: undo },
    { label: 'Rehacer', icon: Redo2, disabled: !canRedo, onSelect: redo },
    { section: 'Cambiar de vista' },
    ...views.map(([id, label]) => ({ label, checked: view === id, onSelect: () => setView(id) })),
  ];
  return (
    <Menu anchor={pointAnchor(context.x, context.y)} entries={entries} onClose={close} label="Acciones del contexto" />
  );
}
