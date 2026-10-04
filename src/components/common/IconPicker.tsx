import { Ban, Plus } from 'lucide-react';
import { createElement, useCallback, useState } from 'react';
import { TYPE_ICONS, typeIcon } from './icon-catalog';
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
  return (
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
      {Object.entries(TYPE_ICONS).map(([name, { icon: component, label }]) => (
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
