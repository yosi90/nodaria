/**
 * El símbolo del ecosistema Yosiftware (`ecosistema-kit/MARCA.md`, `marca/simbolo-trazo.svg`, sin cambiar
 * trazos ni proporciones), en el color del texto. Obligatorio delante de todo enlace a la web social y
 * donde Nodaria dice que usa la cuenta de Yosiftware. No es el logo de Nodaria.
 */
export function YosiSymbol({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="8 8 48 48"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={`yosi-symbol ${className}`.trim()}
    >
      <path
        d="M23.7 21.8L32 32L40.3 21.8M32 32V41.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="16" r="5" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="45" cy="16" r="5" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="32" cy="49" r="5" fill="none" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
