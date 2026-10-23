import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from './Popover';
import { type Anchor } from './anchor';

export type MenuEntry =
  | {
      label: string;
      onSelect: () => void;
      icon?: LucideIcon;
      leading?: ReactNode;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      checked?: boolean;
      /**
       * Abre un submenú junto a la entrada (al pasar por encima, con la flecha derecha o al pulsarla) en vez
       * de elegir: recibe dónde colocarlo. El menú no se cierra.
       */
      submenu?: (anchor: Anchor) => void;
    }
  | 'separator'
  | { section: string };

interface MenuProps {
  anchor: Anchor;
  entries: MenuEntry[];
  onClose: () => void;
  label: string;
  /** Al pasar por otra entrada que no abre submenú (para cerrar el que hubiera abierto). */
  onHoverItem?: () => void;
}

/** Lo que suele medir un submenú, para decidir hacia qué lado se abre. */
const SUBMENU_WIDTH = 280;

/** Dónde se abre un submenú: a la derecha de la entrada, a su altura; si no cabe, a la izquierda. */
const besides = (element: HTMLElement): Anchor => {
  const rect = element.getBoundingClientRect();
  const fitsRight = rect.right + 2 + SUBMENU_WIDTH <= window.innerWidth - 8;
  const x = fitsRight ? rect.right + 2 : Math.max(8, rect.left - 2 - SUBMENU_WIDTH);
  return { x, y: rect.top - 6, width: 0, height: 0, element };
};

/** Menú de acciones con navegación por flechas, Inicio/Fin y Escape. */
export function Menu({ anchor, entries, onClose, label, onHoverItem }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const items = () => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []),
  ];

  useEffect(() => {
    const frame = requestAnimationFrame(() => items()[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % list.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + list.length) % list.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = list.length - 1;
    else if (event.key === 'Tab') return onClose();
    else if (event.key === 'ArrowRight' && index >= 0 && list[index].dataset.submenu === 'true') {
      event.preventDefault();
      list[index].click();
      return;
    } else return;
    event.preventDefault();
    list[next]?.focus();
  };

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div ref={ref} className="menu-items" role="menu" aria-label={label} onKeyDown={onKeyDown}>
        {entries.map((entry, i) => {
          if (entry === 'separator') return <div key={i} className="menu-separator" role="separator" />;
          if ('section' in entry)
            return (
              <div key={i} className="menu-title" role="presentation">
                {entry.section}
              </div>
            );
          const Icon = entry.icon;
          return (
            <button
              key={i}
              type="button"
              role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={entry.checked}
              disabled={entry.disabled}
              className={`menu-item ${entry.danger ? 'danger' : ''} ${entry.submenu ? 'has-submenu' : ''}`}
              aria-haspopup={entry.submenu ? 'menu' : undefined}
              data-submenu={entry.submenu ? 'true' : undefined}
              onMouseEnter={event => {
                if (entry.disabled) return;
                if (entry.submenu) entry.submenu(besides(event.currentTarget));
                else onHoverItem?.();
              }}
              onClick={event => {
                if (entry.submenu) return entry.submenu(besides(event.currentTarget));
                onClose();
                entry.onSelect();
              }}
            >
              {Icon && <Icon size={16} aria-hidden />}
              {entry.leading}
              <span className="label">{entry.label}</span>
              {entry.hint && <span className="hint">{entry.hint}</span>}
              {entry.submenu && <ChevronRight size={14} className="submenu-caret" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
