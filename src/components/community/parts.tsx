import { ExternalLink, Flag, Globe, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  addComment,
  deleteComment,
  localPublicLink,
  newsComments,
  personName,
  setLike,
  socialErrorMessage,
  type NewsComment,
  type NewsItem,
  type Person,
  type PublicSummary,
} from '../../services/community';
import { useNavigation } from '../../state/navigation';
import { Button, IconButton } from '../common/Button';
import { useToast } from '../common/toasts';
import { openPublic, report } from './communityHelpers';
import { dateTimeText } from '../common/dates';

/*
 * Piezas de la sección «Comunidad» (docs/roadmaps/ROADMAP_COMUNIDAD.md): tarjetas de novedad y de proyecto
 * público, el avatar de una persona y la carga de datos de la plataforma.
 */

export function Avatar({ person, size = 32 }: { person: Pick<Person, 'alias' | 'avatar'>; size?: number }) {
  return person.avatar ? (
    <img className="person-avatar" src={person.avatar.miniatura} alt="" width={size} height={size} />
  ) : (
    <span
      className="person-avatar avatar-initial"
      style={{ width: size, height: size, fontSize: Math.max(11, size / 2.6) }}
      aria-hidden
    >
      {person.alias.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Nombre y avatar de una persona, que abren su perfil. */
export function PersonChip({ person, own = false, size = 32 }: { person: Person; own?: boolean; size?: number }) {
  const { openCommunity } = useNavigation();
  return (
    <button type="button" className="person-chip" onClick={() => openCommunity({ tab: 'persona', person: person.id })}>
      <Avatar person={person} size={size} />
      <span className="person-chip-text">
        <strong>{own ? 'Tú' : personName(person)}</strong>
        {person.nombre && <small>@{person.alias}</small>}
      </span>
    </button>
  );
}

export function PublicCard({ publication, showAuthor = true }: { publication: PublicSummary; showAuthor?: boolean }) {
  const { openCommunity } = useNavigation();
  return (
    <article className="public-card">
      {publication.imageUrl && (
        <button type="button" className="public-card-image" onClick={() => openPublic(publication.id)}>
          <img src={publication.imageUrl} alt="" loading="lazy" />
        </button>
      )}
      <header>
        <Globe size={16} aria-hidden />
        <strong>{publication.name}</strong>
      </header>
      {publication.description && <p className="public-card-description">{publication.description}</p>}
      <p className="muted">
        {publication.nodeCount} nodos · {publication.relationCount} relaciones · {dateTimeText(publication.updatedAt)}
      </p>
      <div className="public-card-actions">
        <Button size="sm" icon={ExternalLink} onClick={() => openPublic(publication.id)}>
          Abrir
        </Button>
        {showAuthor && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openCommunity({ tab: 'persona', person: publication.author })}
          >
            Quién lo publicó
          </Button>
        )}
      </div>
    </article>
  );
}

export function NewsCard({ item: initial }: { item: NewsItem }) {
  const toast = useToast();
  const [item, setItem] = useState(initial);
  const [comments, setComments] = useState<NewsComment[] | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const publicId = localPublicLink(item.enlace);
  const own = item.relacion === 'propia';

  const fail = (error: unknown) => toast({ message: socialErrorMessage(error) });
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
        <PersonChip person={item.persona} own={own} />
        <span className="muted">{dateTimeText(item.creada)}</span>
      </header>
      <p>
        {own ? 'Tú' : personName(item.persona)} {item.texto}
      </p>
      {item.imagen && (
        <button
          type="button"
          className="news-image"
          onClick={() => (publicId ? openPublic(publicId) : item.enlace && window.open(item.enlace, '_blank'))}
        >
          <img src={item.imagen} alt="" loading="lazy" />
        </button>
      )}
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
                <span className="muted">{dateTimeText(comment.creado)}</span>
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
