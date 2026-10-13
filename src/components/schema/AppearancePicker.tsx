import { useCallback, useState } from 'react';
import { usePreferences } from '../../state/preferences';
import { ColorSwatches } from '../common/ColorSwatches';
import { IconGrid } from '../common/IconPicker';
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
  const { rememberColor } = usePreferences();
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
      <div className="swatches">
        <ColorSwatches value={color} onChange={color => onChange({ color })} />
        <input
          type="color"
          aria-label="Color personalizado"
          title="Color personalizado"
          value={color}
          onChange={event => onChange({ color: event.target.value })}
          onBlur={event => rememberColor(event.target.value)}
        />
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} role="dialog" label="Iconos">
          <div className="menu-title">Icono</div>
          <IconGrid
            value={icon}
            onPick={name => {
              if (name) onChange({ icon: name });
              close();
            }}
          />
        </Popover>
      )}
    </div>
  );
}
