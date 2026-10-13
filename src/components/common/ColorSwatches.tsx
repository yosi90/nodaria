import type { CSSProperties } from 'react';
import { COLORS } from '../../domain/constants';
import { normalizeColor } from '../../state/colorPalette';
import { usePreferences } from '../../state/preferences';

export function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const { preferences } = usePreferences();
  return (
    <div className="swatches" role="group" aria-label="Colores de acceso rápido">
      {[...COLORS, ...preferences.customColors].map(color => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          title={color}
          aria-pressed={color === normalizeColor(value)}
          style={{ '--swatch': color } as CSSProperties}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
