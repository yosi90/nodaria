import { createElement, useCallback, useState, type CSSProperties } from 'react';
import { COLORS } from '../../domain/constants';
import { TYPE_ICONS } from '../common/icon-catalog';
import { TypeIcon } from '../common/icons';
import { Popover } from '../common/Popover';
import { anchorOf, type Anchor } from '../common/anchor';

interface AppearancePickerProps {
  icon: string;
  color: string;
  onChange: (patch: { icon?: string; color?: string }) => void;
}

/** Icono y color de un tipo: un botón abre la rejilla de iconos y al lado van las muestras de color. */
export function AppearancePicker({ icon, color, onChange }: AppearancePickerProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <div className="appearance-row">
      <button
        type="button"
        className="icon-btn outlined"
        style={{ width: 44, height: 44 }}
        aria-label="Elegir icono"
        data-tooltip="Elegir icono"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={event => (anchor ? close() : setAnchor(anchorOf(event.currentTarget)))}
      >
        <TypeIcon icon={icon} color={color} size="lg" />
      </button>
      <div className="swatches" role="group" aria-label="Color">
        {COLORS.map(swatch => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            aria-pressed={swatch.toLowerCase() === color.toLowerCase()}
            style={{ '--swatch': swatch } as CSSProperties}
            onClick={() => onChange({ color: swatch })}
          />
        ))}
        <input
          type="color"
          aria-label="Color personalizado"
          title="Color personalizado"
          value={color}
          onChange={event => onChange({ color: event.target.value })}
        />
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Iconos">
          <div className="menu-title">Icono</div>
          <div className="icon-grid">
            {Object.entries(TYPE_ICONS).map(([name, { icon: component, label }]) => (
              <button
                key={name}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={name === icon}
                onClick={() => {
                  onChange({ icon: name });
                  close();
                }}
              >
                {createElement(component, { size: 17, 'aria-hidden': true })}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
