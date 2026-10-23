import { ArrowLeft, ExternalLink, Flag, Globe, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  addComment,
  deleteComment,
  discoverFeed,
  followingFeed,
  listPublic,
  localPublicLink,
  myPublications,
  newsComments,
  personName,
  personNews,
  personProfile,
  publicPath,
  setLike,
  type NewsComment,
  type NewsItem,
  type OwnPublication,
  type Person,
  type PublicSummary,
  PlatformRequestError,
} from '../../services/community';
import { sdk, type YosiftwareSdk } from '../../services/yosiftware';
import { useAuth } from '../../state/auth';
import { Button, IconButton } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';
import { YosiSymbol } from '../common/YosiSymbol';
import { FollowButton } from './FollowButton';

type Tab = 'following' | 'discover' | 'mine';

const SOCIAL = 'https://social.yosiftware.es/';

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

/** Abre la página pública en otra pestaña, para no dejar a medias lo que se está editando. */
const openPublic = (publicId: string) => window.open(publicPath(publicId), '_blank', 'noopener');

/**
 * La comunidad de Nodaria (docs/roadmaps/ROADMAP_COMUNIDAD.md): las novedades de quienes sigues, lo que hay
 * para descubrir y lo que has publicado. Seguir, los «me gusta» y los comentarios son de la plataforma.
 */
export function CommunityDialog({ onClose }: { onClose: () => void }) {
  const { status, user, signIn } = useAuth();
  const signedIn = status === 'signed-in' && user !== null;
  const [tab, setTab] = useState<Tab>(signedIn ? 'following' : 'discover');
  const [person, setPerson] = useState<string | null>(null);

  return (
    <Modal title="Comunidad" informational wide onClose={onClose}>
      <div className="community">
        {person ? (
          <PersonView id={person} onBack={() => setPerson(null)} />
        ) : (
          <>
            <div className="segmented community-tabs" role="tablist">
              {(
                [
                  ['following', 'De quienes sigues'],
                  ['discover', 'Descubrir'],
                  ['mine', 'Tus publicados'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'discover' ? (
              <Discover signedIn={signedIn} onPerson={setPerson} />
            ) : !signedIn ? (
              <div className="community-empty">
                <p>
                  Entra con tu cuenta de Yosiftware para ver las novedades de quienes sigues y lo que has publicado.
                </p>
                <Button variant="primary" onClick={() => void signIn()}>
                  Entrar
                </Button>
              </div>
            ) : tab === 'following' ? (
              <Following onPerson={setPerson} onDiscover={() => setTab('discover')} />
            ) : (
              <Mine />
            )}
          </>
        )}
        <p className="muted-note community-foot">
          <a className="social-link" href={SOCIAL} target="_blank" rel="noreferrer">
            <YosiSymbol size={14} /> Tus amistades y seguidos se gestionan en tu cuenta de Yosiftware
          </a>
        </p>
      </div>
    </Modal>
  );
}

function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(
      result => alive && setValue(result),
      (failure: unknown) => alive && setError(failure instanceof Error ? failure.message : String(failure)),
    );
    return () => {
      alive = false;
    };
  }, [load]);
  return { value, setValue, error };
}

function Following({ onPerson, onDiscover }: { onPerson: (id: string) => void; onDiscover: () => void }) {
  const load = useCallback(() => followingFeed(), []);
  const { value, setValue, error } = useLoad(load);
  const [more, setMore] = useState(false);
  if (error) return <p className="group-error">{error}</p>;
  if (!value) return <p className="muted-note">Cargando…</p>;
  if (!value.novedades.length)
    return (
      <div className="community-empty">
        <p>Aún no hay novedades de Nodaria de las personas a las que sigues.</p>
        <Button onClick={onDiscover}>Descubrir proyectos y personas</Button>
      </div>
    );
  const loadMore = async () => {
    setMore(true);
    try {
      const next = await followingFeed(value.cursor);
      setValue({ novedades: [...value.novedades, ...next.novedades], cursor: next.cursor });
    } finally {
      setMore(false);
    }
  };
  return (
    <div className="news-list">
      {value.novedades.map(item => (
        <NewsCard key={item.id} item={item} onPerson={onPerson} />
      ))}
      {value.cursor && (
        <Button disabled={more} onClick={() => void loadMore()}>
          {more ? 'Cargando…' : 'Ver más'}
        </Button>
      )}
    </div>
  );
}

function Discover({ signedIn, onPerson }: { signedIn: boolean; onPerson: (id: string) => void }) {
  const loadProjects = useCallback(() => listPublic(), []);
  const projects = useLoad(loadProjects);
  const loadNews = useCallback(
    () => (signedIn ? discoverFeed().then(r => r.novedades) : Promise.resolve([] as NewsItem[])),
    [signedIn],
  );
  const news = useLoad(loadNews);
  return (
    <div className="community-columns">
      <section>
        <h3>Proyectos públicos recientes</h3>
        {projects.error && <p className="group-error">{projects.error}</p>}
        {!projects.value && !projects.error && <p className="muted-note">Cargando…</p>}
        {projects.value && !projects.value.length && <p className="muted-note">Todavía no hay proyectos públicos.</p>}
        <div className="public-list">
          {projects.value?.map(p => (
            <PublicCard key={p.id} publication={p} onPerson={signedIn ? onPerson : undefined} />
          ))}
        </div>
      </section>
      {signedIn && (
        <section>
          <h3>Novedades para descubrir</h3>
          {news.error && <p className="group-error">{news.error}</p>}
          {news.value && !news.value.length && <p className="muted-note">Nada nuevo esta semana.</p>}
          <div className="news-list">
            {news.value?.map(item => (
              <NewsCard key={item.id} item={item} onPerson={onPerson} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Mine() {
  const { getToken } = useAuth();
  const toast = useToast();
  const load = useCallback(async () => {
    const token = await getToken();
    return token ? myPublications(token) : [];
  }, [getToken]);
  const { value, error } = useLoad<OwnPublication[]>(load);
  if (error) return <p className="group-error">{error}</p>;
  if (!value) return <p className="muted-note">Cargando…</p>;
  if (!value.length)
    return (
      <div className="community-empty">
        <p>
          No has publicado ningún proyecto. Para hacerlo público, abre el proyecto y elige «Publicar…» en sus ajustes
          (el engranaje junto a su nombre).
        </p>
      </div>
    );
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: 'Enlace copiado' });
    } catch {
      toast({ message: url });
    }
  };
  return (
    <div className="public-list">
      {value.map(p => (
        <article key={p.id} className={`public-card ${p.state === 'retirado' ? 'retired' : ''}`}>
          <header>
            <Globe size={16} aria-hidden />
            <strong>{p.name}</strong>
            {p.state === 'retirado' && <span className="badge">Retirado por moderación</span>}
          </header>
          <p className="muted">
            {p.nodeCount} nodos · {p.relationCount} relaciones · actualizado el {when(p.updatedAt)}
          </p>
          {p.state === 'publico' && (
            <div className="public-card-actions">
              <Button size="sm" icon={ExternalLink} onClick={() => openPublic(p.id)}>
                Ver
              </Button>
              <Button size="sm" onClick={() => void copy(p.url)}>
                Copiar el enlace
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function PublicCard({ publication, onPerson }: { publication: PublicSummary; onPerson?: (id: string) => void }) {
  return (
    <article className="public-card">
      <header>
        <Globe size={16} aria-hidden />
        <strong>{publication.name}</strong>
      </header>
      {publication.description && <p className="public-card-description">{publication.description}</p>}
      <p className="muted">
        {publication.nodeCount} nodos · {publication.relationCount} relaciones · {when(publication.updatedAt)}
      </p>
      <div className="public-card-actions">
        <Button size="sm" icon={ExternalLink} onClick={() => openPublic(publication.id)}>
          Abrir
        </Button>
        {onPerson && (
          <Button size="sm" variant="ghost" onClick={() => onPerson(publication.author)}>
            Quién lo publicó
          </Button>
        )}
      </div>
    </article>
  );
}

function Avatar({ person, size = 32 }: { person: Person; size?: number }) {
  return person.avatar ? (
    <img className="person-avatar" src={person.avatar.miniatura} alt="" width={size} height={size} />
  ) : (
    <span className="person-avatar avatar-initial" style={{ width: size, height: size }} aria-hidden>
      {person.alias.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Lo de la plataforma se denuncia con su ventana (`ecosistema-kit/MODERACION.md`). */
const report = (options: Parameters<NonNullable<YosiftwareSdk['denunciar']>>[0]) => void sdk()?.denunciar?.(options);

function NewsCard({ item: initial, onPerson }: { item: NewsItem; onPerson: (id: string) => void }) {
  const toast = useToast();
  const [item, setItem] = useState(initial);
  const [comments, setComments] = useState<NewsComment[] | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const publicId = localPublicLink(item.enlace);
  const own = item.relacion === 'propia';

  const fail = (error: unknown) => toast({ message: error instanceof Error ? error.message : 'No se ha podido.' });
  const like = async () => {
    const next = !item.meGusta.propio;
    setItem({ ...item, meGusta: { propio: next, total: item.meGusta.total + (next ? 1 : -1) } });
    try {
      await setLike(item.id, next);
    } catch (error) {
      setItem(item);
      fail(error);
    }
  };
  const toggleComments = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      try {
        setComments((await newsComments(item.id)).comentarios);
      } catch (error) {
        fail(error);
      }
    }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const created = await addComment(item.id, text.trim());
      setComments([...(comments ?? []), created]);
      setItem({ ...item, comentarios: item.comentarios + 1 });
      setText('');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (comment: NewsComment) => {
    try {
      await deleteComment(item.id, comment.id);
      setComments((comments ?? []).filter(c => c.id !== comment.id));
      setItem({ ...item, comentarios: Math.max(0, item.comentarios - 1) });
    } catch (error) {
      fail(error);
    }
  };

  return (
    <article className="news-card">
      <header>
        <button type="button" className="person-chip" onClick={() => onPerson(item.persona.id)}>
          <Avatar person={item.persona} />
          <strong>{own ? 'Tú' : personName(item.persona)}</strong>
        </button>
        <span className="muted">{when(item.creada)}</span>
      </header>
      <p>
        {own ? 'Tú' : personName(item.persona)} {item.texto}
      </p>
      <div className="news-actions">
        {publicId ? (
          <Button size="sm" icon={ExternalLink} onClick={() => openPublic(publicId)}>
            Abrir el proyecto
          </Button>
        ) : (
          item.enlace && (
            <a className="btn sm" href={item.enlace} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> Abrir
            </a>
          )
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Heart}
          aria-pressed={item.meGusta.propio}
          className={item.meGusta.propio ? 'liked' : ''}
          onClick={() => void like()}
        >
          {item.meGusta.total || ''} Me gusta
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={MessageCircle}
          aria-expanded={open}
          onClick={() => void toggleComments()}
        >
          {item.comentarios || ''} Comentarios
        </Button>
        {!own && (
          <IconButton
            icon={Flag}
            size="sm"
            variant="ghost"
            label="Denunciar la novedad"
            onClick={() =>
              report({ tipo: 'novedad', referencia: item.id, extracto: item.texto, persona: item.persona.id })
            }
          />
        )}
      </div>
      {open && (
        <div className="news-comments">
          {comments === null && <p className="muted-note">Cargando…</p>}
          {comments?.map(comment => (
            <div key={comment.id} className="news-comment">
              <Avatar person={comment.persona} size={24} />
              <div>
                <strong>{comment.propio ? 'Tú' : personName(comment.persona)}</strong>{' '}
                <span className="muted">{when(comment.creado)}</span>
                <p>{comment.texto}</p>
              </div>
              {(comment.propio || own) && (
                <IconButton
                  icon={Trash2}
                  size="sm"
                  variant="ghost"
                  label="Borrar el comentario"
                  onClick={() => void remove(comment)}
                />
              )}
              {!comment.propio && (
                <IconButton
                  icon={Flag}
                  size="sm"
                  variant="ghost"
                  label="Denunciar el comentario"
                  onClick={() =>
                    report({
                      tipo: 'comentario',
                      referencia: comment.id,
                      extracto: comment.texto,
                      persona: comment.persona.id,
                    })
                  }
                />
              )}
            </div>
          ))}
          <form
            className="news-comment-form"
            onSubmit={event => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={text}
              maxLength={500}
              placeholder="Escribe un comentario"
              aria-label="Comentario"
              onChange={e => setText(e.target.value)}
            />
            <Button type="submit" size="sm" variant="primary" disabled={busy || !text.trim()}>
              Comentar
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}

/** El perfil de una persona en Nodaria: sus proyectos públicos, sus novedades y «Seguir». */
function PersonView({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuth();
  const own = user?.id === id.toLowerCase();
  // `null` es que no hay nadie: no existe, está suspendida o hay un bloqueo (no se revela cuál).
  const loadProfile = useCallback(() => personProfile(id).then(found => ({ found })), [id]);
  const profile = useLoad(loadProfile);
  const loadProjects = useCallback(() => listPublic(id), [id]);
  const projects = useLoad(loadProjects);
  const loadNews = useCallback(
    () =>
      personNews(id).catch((error: unknown) => {
        if (error instanceof PlatformRequestError && error.status === 404)
          return { novedades: [], cursor: null, reservadas: false };
        throw error;
      }),
    [id],
  );
  const news = useLoad(loadNews);
  const person = profile.value?.found ?? null;

  return (
    <div className="person-view">
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
        Volver
      </Button>
      {!profile.value && !profile.error && <p className="muted-note">Cargando…</p>}
      {profile.error && <p className="group-error">{profile.error}</p>}
      {profile.value && !person && <p className="muted-note">No se encuentra a esta persona.</p>}
      {person && (
        <header className="person-head">
          <Avatar person={person} size={56} />
          <div>
            <h3>{personName(person)}</h3>
            <span className="muted">@{person.alias}</span>
            {person.biografia && <p>{person.biografia}</p>}
          </div>
          <div className="spacer" />
          {!own && <FollowButton personId={id} />}
          {!own && (
            <IconButton
              icon={Flag}
              size="sm"
              variant="ghost"
              label="Denunciar a esta persona"
              onClick={() => report({ tipo: 'persona', referencia: id, nombre: personName(person), persona: id })}
            />
          )}
        </header>
      )}
      {/* Si no hay nadie (también por un bloqueo), tampoco se enseña lo suyo. */}
      {person && (
        <>
          <section>
            <h3>Proyectos públicos</h3>
            {projects.value && !projects.value.length && <p className="muted-note">No tiene proyectos públicos.</p>}
            <div className="public-list">
              {projects.value?.map(p => (
                <PublicCard key={p.id} publication={p} />
              ))}
            </div>
          </section>
          <section>
            <h3>Novedades en Nodaria</h3>
            {news.value?.reservadas && (
              <p className="muted-note">Su perfil es privado: solo sus amistades ven sus novedades.</p>
            )}
            {news.value && !news.value.reservadas && !news.value.novedades.length && (
              <p className="muted-note">Sin novedades.</p>
            )}
            <div className="news-list">
              {news.value?.novedades.map(item => (
                <NewsCard key={item.id} item={item} onPerson={() => undefined} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
