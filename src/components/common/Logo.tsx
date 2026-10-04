/**
 * Marca de Nodaria: tres nodos unidos en un árbol con un vínculo transversal, el gesto de
 * «jerarquía más relaciones» que define la aplicación. Dibujo propio en SVG, sin dependencias.
 */
export function Logo({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 7.5V4.5M12 4.5H6.5V9M12 4.5h5.5V9" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M8.2 18.2 15.8 15" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray="2.6 2.2" />
      <circle cx="12" cy="4.5" r="2.6" fill={color} />
      <circle cx="6.5" cy="12" r="3" fill={color} />
      <circle cx="17.5" cy="12" r="3" fill={color} />
      <circle cx="12" cy="19.5" r="2.6" fill={color} />
      <path d="M6.5 15v4.5M17.5 15v4.5" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0" />
    </svg>
  );
}
