import { Ban, Plus } from 'lucide-react';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { iconChoices, typeIcon } from './icon-catalog';
import { Popover } from './Popover';
import { anchorOf, type Anchor } from './anchor';

/** Rejilla de iconos del catálogo. Con `allowNone`, la primera casilla quita el icono. */
export function IconGrid({
  value,
  allowNone,
  onPick,
}: {
  value: string | null;
  allowNone?: boolean;
  onPick: (icon: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const search = useRef<HTMLInputElement>(null);
  const icons = iconChoices(query, family, value);
  useEffect(() => {
    // El popover se hace visible después de medir su posición.
    const frame = requestAnimationFrame(() => search.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <>
      <div className="icon-search">
        <input
          ref={search}
          type="search"
          aria-label="Buscar iconos"
          placeholder="Buscar: teléfono, oficina, código…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              if (icons[0]) onPick(icons[0][0]);
            }
          }}
        />
        <select aria-label="Paquete de iconos" value={family} onChange={e => setFamily(e.target.value)}>
          <option value="all">Todos los paquetes</option>
          <option value="Lucide">Lucide</option>
          <option value="Phosphor">Phosphor · uso general</option>
        </select>
      </div>
      <div className="icon-grid">
        {allowNone && (
          <button
            type="button"
            aria-label="Sin icono"
            title="Sin icono"
            aria-pressed={!value}
            onClick={() => onPick(null)}
          >
            <Ban size={17} aria-hidden />
          </button>
        )}
        {icons.map(([name, { icon: component, label }]) => (
          <button
            key={name}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={name === value}
            onClick={() => onPick(name)}
          >
            {createElement(component, { size: 17, 'aria-hidden': true })}
          </button>
        ))}
      </div>
      {!icons.length && (
        <p className="menu-empty" role="status">
          No hay iconos que coincidan.
        </p>
      )}
    </>
  );
}

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
  label?: string;
  /** Tamaño del botón en píxeles. */
  size?: number;
}

/** Botón pequeño que muestra el icono elegido (o un «+») y abre la rejilla para cambiarlo o quitarlo. */
export function IconPicker({ value, onChange, label = 'Elegir icono', size = 30 }: IconPickerProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <>
      <button
        type="button"
        className={`icon-btn outlined icon-picker ${value ? '' : 'empty'}`}
        style={{ width: size, height: size }}
        aria-label={label}
        data-tooltip={label}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={event => (anchor ? close() : setAnchor(anchorOf(event.currentTarget)))}
      >
        {value ? (
          createElement(typeIcon(value), { size: 15, strokeWidth: 2.2, 'aria-hidden': true })
        ) : (
          <Plus size={13} aria-hidden />
        )}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Iconos">
          <div className="menu-title">Icono</div>
          <IconGrid
            value={value}
            allowNone
            onPick={icon => {
              onChange(icon);
              close();
            }}
          />
        </Popover>
      )}
    </>
  );
}
