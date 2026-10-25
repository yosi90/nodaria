import { useCallback, useState } from 'react';
import { followingFeed, socialErrorMessage, type NewsItem } from '../../services/community';
import { useNavigation } from '../../state/navigation';
import { Button } from '../common/Button';
import { useSentinel } from './communityHelpers';
import { useLoad } from '../common/useLoad';
import { NewsCard } from './parts';

/** «Inicio»: las novedades de Nodaria de tus amistades y de quienes sigues, cargando más al llegar al final. */
export function FeedTab() {
  const { openCommunity } = useNavigation();
  const load = useCallback(() => followingFeed(), []);
  const { value, setValue, error, reload } = useLoad<{ novedades: NewsItem[]; cursor: string | null }>(
    load,
    socialErrorMessage,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const loadMore = async () => {
    if (!value?.cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await followingFeed(value.cursor);
      setValue({ novedades: [...value.novedades, ...next.novedades], cursor: next.cursor });
    } catch (failure) {
      setMoreError(socialErrorMessage(failure));
    } finally {
      setLoadingMore(false);
    }
  };
  const sentinel = useSentinel(() => void loadMore(), Boolean(value?.cursor) && !loadingMore && !moreError);

  return (
    <div className="community-page">
      <header className="community-page-head">
        <h2>Inicio</h2>
        <p className="muted-note">Lo que publican en Nodaria tus amistades y las personas a las que sigues.</p>
        <Button size="sm" variant="ghost" onClick={reload}>
          Actualizar
        </Button>
      </header>
      {error && <p className="group-error">{error}</p>}
      {!value && !error && <p className="muted-note">Cargando…</p>}
      {value && !value.novedades.length && (
        <div className="community-empty">
          <p>Aún no hay novedades de Nodaria de las personas a las que sigues.</p>
          <div className="community-empty-actions">
            <Button variant="primary" onClick={() => openCommunity({ tab: 'descubrir' })}>
              Descubrir proyectos
            </Button>
            <Button onClick={() => openCommunity({ tab: 'personas' })}>Buscar personas</Button>
          </div>
        </div>
      )}
      <div className="news-list feed">
        {value?.novedades.map(item => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>
      {value?.cursor && (
        <div ref={sentinel} className="feed-more">
          {moreError ? (
            <Button size="sm" onClick={() => void loadMore()}>
              Reintentar ({moreError})
            </Button>
          ) : (
            <span className="muted-note">{loadingMore ? 'Cargando más…' : ''}</span>
          )}
        </div>
      )}
      {value && value.novedades.length > 0 && !value.cursor && (
        <p className="muted-note feed-end">No hay más novedades.</p>
      )}
    </div>
  );
}
