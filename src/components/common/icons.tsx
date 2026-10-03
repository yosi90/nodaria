import { createElement, type CSSProperties } from 'react';
import { typeIcon } from './icon-catalog';

/** Icono de un tipo sobre un fondo tintado con su color. */
export function TypeIcon({
  icon,
  color,
  size = 'md',
}: {
  icon: string | undefined;
  color: string | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'lg' ? 18 : size === 'sm' ? 11 : 13;
  return (
    <span className={`type-icon ${size}`} style={{ '--type-color': color } as CSSProperties} aria-hidden>
      {createElement(typeIcon(icon), { size: px, strokeWidth: 2.2 })}
    </span>
  );
}
