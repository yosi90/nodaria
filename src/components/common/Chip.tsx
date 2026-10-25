import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Un valor elegido en una lista de chips (`MultiSelect`, `TagsInput`); con `onRemove`, se puede quitar. */
export function Chip({ label, leading, onRemove }: { label: string; leading?: ReactNode; onRemove?: () => void }) {
  return (
    <span className="chip">
      {leading}
      <span>{label}</span>
      {onRemove && (
        <button type="button" aria-label={`Quitar ${label}`} onClick={onRemove}>
          <X size={12} aria-hidden />
        </button>
      )}
    </span>
  );
}
