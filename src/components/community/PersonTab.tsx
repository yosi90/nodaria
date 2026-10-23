import { ArrowLeft } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  listPublic,
  personName,
  personNews,
  personProfile,
  PlatformRequestError,
  type NewsItem,
} from '../../services/community';
import { useAuth } from '../../state/auth';
import { useNavigation } from '../../state/navigation';
import { Button } from '../common/Button';
import { useLoad } from './communityHelpers';
import { Avatar, NewsCard, PublicCard } from './parts';
import { RelationActions } from './RelationActions';

/**
 * El perfil de una persona en Nodaria: lo que enseña su perfil de Yosiftware, sus proyectos públicos y sus
 * novedades en Nodaria, con las acciones (seguir, amistad, mensaje, bloquear, denunciar). Si no hay nadie
 * (no existe, está suspendida o hay un bloqueo), no se enseña nada suyo: un bloqueo no se revela.
 */
export function PersonTab({ id }: { id: string }) {
  const { user } = useAuth();
  const { openCommunity } = useNavigation();
  const own = user?.id === id.toLowerCase();
  const loadProfile = useCallback(() => personProfile(id).then(found => ({ found })), [id]);
  const profile = useLoad(loadProfile);
  const loadProjects = useCallback(() => listPublic(id), [id]);
  const projects = useLoad(loadProjects);
  const loadNews = useCallback(
    () =>
      personNews(id).catch((error: unknown) => {
        if (error instanceof PlatformRequestError && error.status === 404)
          return { novedades: [] as NewsItem[], cursor: null, reservadas: false };
        throw error;
      }),
    [id],
  );
  const news = useLoad(loadNews);
  const [more, setMore] = useState(false);
  const person = profile.value?.found ?? null;

  const loadMore = async () => {
    if (!news.value?.cursor) return;
    setMore(true);
    try {
      const next = await personNews(id, news.value.cursor);
      news.setValue({ ...next, novedades: [...news.value.novedades, ...next.novedades] });
    } finally {
      setMore(false);
    }
  };

  return (
    <div className="community-page person-page">
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => openCommunity({ tab: 'personas' })}>
        Personas
      </Button>
      {!profile.value && !profile.error && <p className="muted-note">Cargando…</p>}
      {profile.error && <p className="group-error">{profile.error}</p>}
      {profile.value && !person && <p className="muted-note">No se encuentra a esta persona.</p>}
      {person && (
        <>
          <header className="person-head">
            <Avatar person={person} size={72} />
            <div className="person-head-text">
              <h2>{own ? `${personName(person)} (tú)` : personName(person)}</h2>
              <span className="muted">@{person.alias}</span>
              {person.biografia && <p>{person.biografia}</p>}
            </div>
            {!own && <RelationActions person={person} />}
          </header>
          <section className="community-section">
            <h3>Proyectos públicos</h3>
            {projects.value && !projects.value.length && (
              <p className="muted-note">{own ? 'No has publicado ningún proyecto.' : 'No tiene proyectos públicos.'}</p>
            )}
            <div className="public-grid">
              {projects.value?.map(p => (
                <PublicCard key={p.id} publication={p} showAuthor={false} />
              ))}
            </div>
          </section>
          <section className="community-section">
            <h3>Novedades en Nodaria</h3>
            {news.value?.reservadas && (
              <p className="muted-note">Su perfil es privado: solo sus amistades ven sus novedades.</p>
            )}
            {news.value && !news.value.reservadas && !news.value.novedades.length && (
              <p className="muted-note">Sin novedades.</p>
            )}
            <div className="news-list feed">
              {news.value?.novedades.map(item => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
            {news.value?.cursor && (
              <Button size="sm" disabled={more} onClick={() => void loadMore()}>
                {more ? 'Cargando…' : 'Ver más'}
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
