import { Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { foldText } from '../../domain/text';
import { discoverFeed, listPublic, type NewsItem } from '../../services/community';
import { useLoad } from './communityHelpers';
import { NewsCard, PublicCard } from './parts';

/**
 * «Descubrir»: los proyectos públicos recientes de Nodaria (se ven también sin cuenta) y, con sesión, las
 * novedades públicas de los últimos días de personas a las que aún no sigues.
 */
export function DiscoverTab({ signedIn }: { signedIn: boolean }) {
  const loadProjects = useCallback(() => listPublic(), []);
  const projects = useLoad(loadProjects);
  const loadNews = useCallback(
    () => (signedIn ? discoverFeed().then(r => r.novedades) : Promise.resolve([] as NewsItem[])),
    [signedIn],
  );
  const news = useLoad(loadNews);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = foldText(query.trim());
    return (projects.value ?? []).filter(p => !q || foldText(`${p.name} ${p.description}`).includes(q));
  }, [projects.value, query]);

  return (
    <div className="community-page">
      <header className="community-page-head">
        <h2>Descubrir</h2>
        <p className="muted-note">Proyectos que la gente ha hecho públicos en Nodaria.</p>
        <label className="community-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="Buscar proyectos"
            aria-label="Buscar proyectos públicos"
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </header>
      {projects.error && <p className="group-error">{projects.error}</p>}
      {!projects.value && !projects.error && <p className="muted-note">Cargando…</p>}
      {projects.value && !shown.length && (
        <p className="muted-note">{query ? 'Ningún proyecto coincide.' : 'Todavía no hay proyectos públicos.'}</p>
      )}
      <div className="public-grid">
        {shown.map(p => (
          <PublicCard key={p.id} publication={p} showAuthor={signedIn} />
        ))}
      </div>
      {signedIn && (
        <section className="community-section">
          <h3>Novedades para descubrir</h3>
          {news.error && <p className="group-error">{news.error}</p>}
          {news.value && !news.value.length && <p className="muted-note">Nada nuevo esta semana.</p>}
          <div className="news-list feed">
            {news.value?.map(item => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
