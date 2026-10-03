import { Check, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Option {
  value: string;
  label: string;
  hint?: string;
  /** Contenido previo a la etiqueta (icono de tipo, punto de color…). */
  leading?: ReactNode;
  disabled?: boolean;
}

interface OptionListProps {
  options: Option[];
  selected: string[];
  onPick: (value: string) => void;
  /** Muestra el buscador cuando hay más opciones que este número. */
  searchThreshold?: number;
  emptyLabel?: string;
  title?: string;
  multiple?: boolean;
}

const DIACRITICS = /[\u0300-\u036f]/g;
const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(DIACRITICS, '');

/** Lista de opciones navegable con teclado y filtro por texto (sin acentos ni mayúsculas). */
export function OptionList({
  options,
  selected,
  onPick,
  searchThreshold = 7,
  emptyLabel = 'No hay opciones',
  title,
  multiple,
}: OptionListProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const showSearch = options.length > searchThreshold;
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter(o => normalize(`${o.label} ${o.hint ?? ''}`).includes(q)) : options;
  }, [options, query]);
  const firstSelected = filtered.findIndex(o => selected.includes(o.value));
  const [active, setActive] = useState(Math.max(0, firstSelected));
  const activeIndex = Math.min(active, filtered.length - 1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
    else listRef.current?.focus();
  }, [showSearch]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const move = (delta: number) => {
    if (!filtered.length) return;
    let next = activeIndex;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next].disabled) break;
    }
    setActive(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(filtered.length - 1);
    else if (event.key === 'Enter') {
      const option = filtered[activeIndex];
      if (option && !option.disabled) onPick(option.value);
    } else return;
    event.preventDefault();
  };

  return (
    <div onKeyDown={onKeyDown}>
      {title && <div className="menu-title">{title}</div>}
      {showSearch && (
        <div className="menu-search search-input">
          <Search size={14} aria-hidden style={{ left: 17, top: 'calc(50% + 2px)' }} />
          <input
            ref={searchRef}
            value={query}
            placeholder="Buscar…"
            aria-label="Buscar opciones"
            aria-controls={listId}
            aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            onChange={event => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
        </div>
      )}
      <div
        ref={listRef}
        id={listId}
        className="menu-items"
        role="listbox"
        aria-multiselectable={multiple || undefined}
        tabIndex={showSearch ? -1 : 0}
        aria-activedescendant={!showSearch && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      >
        {filtered.length ? (
          filtered.map((option, index) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`menu-item ${index === activeIndex ? 'active' : ''}`}
                onMouseMove={() => index !== activeIndex && setActive(index)}
                onClick={() => onPick(option.value)}
              >
                {option.leading}
                <span className="label">{option.label}</span>
                {option.hint && <span className="hint">{option.hint}</span>}
                {isSelected && <Check size={15} aria-hidden />}
              </button>
            );
          })
        ) : (
          <div className="menu-empty">{query ? 'Sin resultados' : emptyLabel}</div>
        )}
      </div>
    </div>
  );
}
