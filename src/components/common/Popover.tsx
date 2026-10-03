import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Anchor } from './anchor';

const MARGIN = 8;
const GAP = 4;

interface PopoverProps {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Igualar la anchura del popover a la del ancla (selectores). */
  matchWidth?: boolean;
  role?: string;
  label?: string;
}

export function Popover({ anchor, onClose, children, className = '', matchWidth, role, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const below = anchor.y + anchor.height + GAP;
    const fitsBelow = below + height <= window.innerHeight - MARGIN;
    const top = fitsBelow ? below : Math.max(MARGIN, anchor.y - GAP - height);
    const left = Math.min(Math.max(MARGIN, anchor.x), window.innerWidth - width - MARGIN);
    setPosition({ left, top });
  }, [anchor]);

  useEffect(() => {
    const trigger = anchor.element;
    const popover = ref.current;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node;
      if (popover?.contains(target) || trigger?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (trigger?.isConnected && popover?.contains(document.activeElement)) trigger.focus();
    };
  }, [anchor.element, onClose]);

  // Dentro de un <dialog> modal hay que montarse en él para no quedar debajo de la capa superior.
  const container = anchor.element?.closest('dialog[open]') ?? document.body;
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      role={role}
      aria-label={label}
      style={{
        left: position?.left ?? anchor.x,
        top: position?.top ?? anchor.y + anchor.height + GAP,
        visibility: position ? 'visible' : 'hidden',
        width: matchWidth ? Math.max(anchor.width, 220) : undefined,
      }}
    >
      {children}
    </div>,
    container,
  );
}
