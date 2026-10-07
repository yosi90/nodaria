/** Enlaces a las páginas estáticas de privacidad y condiciones de uso (se abren aparte). */
export function LegalLinks({ prefix }: { prefix?: string }) {
  return (
    <small className="legal-links">
      {prefix}
      <a href="/condiciones" target="_blank" rel="noopener">
        Condiciones de uso
      </a>
      {' · '}
      <a href="/privacidad" target="_blank" rel="noopener">
        Política de privacidad
      </a>
    </small>
  );
}
