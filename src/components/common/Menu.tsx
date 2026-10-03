import type { LucideIcon } from 'lucide-react';
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
    }
  | 'separator'
  | { section: string };

interface MenuProps {
  anchor: Anchor;
  entries: MenuEntry[];
  onClose: () => void;
  label: string;
}

/** Menú de acciones con navegación por flechas, Inicio/Fin y Escape. */
export function Menu({ anchor, entries, onClose, label }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const items = () => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []),
  ];

  useEffect(() => {
    items()[0]?.focus();
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
    else return;
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
              className={`menu-item ${entry.danger ? 'danger' : ''}`}
              onClick={() => {
                onClose();
                entry.onSelect();
              }}
            >
              {Icon && <Icon size={16} aria-hidden />}
              {entry.leading}
              <span className="label">{entry.label}</span>
              {entry.hint && <span className="hint">{entry.hint}</span>}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
