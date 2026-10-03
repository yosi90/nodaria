import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clampPanel, PANEL_LIMITS } from '../../state/preferences';

interface SplitterProps {
  width: number;
  onChange: (width: number) => void;
  /** `right`: el panel crece al arrastrar hacia la derecha (panel izquierdo); `left`, al contrario. */
  grow: 'right' | 'left';
  label: string;
}

/** Asa para redimensionar un panel lateral con el ratón o con las flechas del teclado. */
export function Splitter({ width, onChange, grow, label }: SplitterProps) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sign = grow === 'right' ? 1 : -1;

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    onChange(clampPanel(start.current.width + sign * (event.clientX - start.current.x)));
  };
  const onPointerUp = () => {
    start.current = null;
    setDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowRight') onChange(clampPanel(width + sign * step));
    else if (event.key === 'ArrowLeft') onChange(clampPanel(width - sign * step));
    else return;
    event.preventDefault();
  };

  return (
    <button
      type="button"
      className={`splitter ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={PANEL_LIMITS.min}
      aria-valuemax={PANEL_LIMITS.max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
