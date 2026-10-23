import { Copy, ExternalLink, Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PUBLICATION_OPTIONS,
  publicationSnapshot,
  publicationSummary,
  type PublicationOptions,
} from '../../domain/publication';
import { ApiError } from '../../services/api';
import {
  getPublication,
  publishErrorMessage,
  publishProject,
  unpublishProject,
  type OwnPublication,
} from '../../services/community';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';
import { useSync } from '../../state/sync';
import { Button } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Modal } from '../common/Modal';
import { schemaOption } from '../common/options';
import { MultiSelect } from '../common/Select';
import { useToast } from '../common/toasts';
import { YosiSymbol } from '../common/YosiSymbol';

const SOCIAL_NEWS = 'https://social.yosiftware.es/?vista=novedades';

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });

/**
 * Hacer público el proyecto abierto (docs/roadmaps/ROADMAP_COMUNIDAD.md): se publica una copia de solo
 * lectura que se actualiza a mano con «Publicar los cambios». Quien publica elige qué deja fuera.
 */
export function PublishDialog({ onClose }: { onClose: () => void }) {
  const { project } = useApp();
  const { status, user, getToken, signIn } = useAuth();
  const { syncNow } = useSync();
  const { groupOf } = useGroups();
  const toast = useToast();
  const { confirm } = useDialogs();
  const group = groupOf(project.id);
  const signedIn = status === 'signed-in' && user !== null;

  const [current, setCurrent] = useState<OwnPublication | null | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<PublicationOptions>(DEFAULT_PUBLICATION_OPTIONS);
  const [allowCopy, setAllowCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!signedIn || group) return;
    let alive = true;
    void (async () => {
      try {
        const token = await getToken();
        const found = token ? await getPublication(token, project.id) : null;
        if (!alive) return;
        setCurrent(found);
        if (found) {
          setDescription(found.description);
          setOptions({ ...DEFAULT_PUBLICATION_OPTIONS, ...found.options });
          setAllowCopy(found.allowCopy);
        }
      } catch (failure) {
        if (alive) {
          setCurrent(null);
          setError(publishErrorMessage(failure));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, group, getToken, project.id]);

  const summary = useMemo(() => publicationSummary(project, options), [project, options]);
  const typeOptions = useMemo(() => project.schemas.map(s => schemaOption(s)), [project.schemas]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      // La API solo publica proyectos que la cuenta ya tiene: primero se sube lo último.
      await syncNow();
      const token = await getToken();
      if (!token) throw new ApiError(401, 'no_autenticado', 'Entra con tu cuenta para publicar.');
      const published = await publishProject(token, publicationSnapshot(project, options), {
        description: description.trim(),
        options,
        allowCopy,
      });
      setCurrent(published);
      toast({ message: current ? 'Cambios publicados' : 'Proyecto publicado' });
    } catch (failure) {
      setError(publishErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    const ok = await confirm({
      title: 'Dejar de publicar',
      message: `«${project.name}» dejará de verse con su enlace y se retirarán sus novedades. Tu proyecto no cambia.`,
      confirmLabel: 'Dejar de publicar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (token) await unpublishProject(token, project.id);
      setCurrent(null);
      toast({ message: 'El proyecto ya no es público' });
    } catch (failure) {
      setError(publishErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: 'Enlace copiado' });
    } catch {
      toast({ message: url });
    }
  };

  if (!signedIn || group) {
    return (
      <Modal title="Publicar el proyecto" informational onClose={onClose}>
        <div className="form-grid">
          {group ? (
            <p className="muted-note">
              Los proyectos de un grupo todavía no se pueden publicar. Duplícalo para publicar tu propia copia.
            </p>
          ) : (
            <>
              <p className="muted-note">
                Entra con tu cuenta de Yosiftware para hacer público este proyecto: se verá con un enlace, sin que nadie
                pueda cambiarlo, y quienes te siguen recibirán la novedad.
              </p>
              <Button variant="primary" onClick={() => void signIn()}>
                Entrar
              </Button>
            </>
          )}
        </div>
      </Modal>
    );
  }

  const retired = current?.state === 'retirado';
  return (
    <Modal
      title={current ? 'Proyecto público' : 'Publicar el proyecto'}
      wide
      submitLabel={busy ? 'Publicando…' : current ? 'Publicar los cambios' : 'Publicar'}
      submitDisabled={busy || current === undefined || retired}
      initialFocus={descriptionRef}
      onClose={onClose}
      onSubmit={() => void publish()}
    >
      <div className="form-grid publish-dialog">
        {current === undefined && <p className="muted-note">Comprobando si ya es público…</p>}
        {current && (
          <section className={`publish-status ${retired ? 'retired' : ''}`}>
            <Globe size={18} aria-hidden />
            <div>
              {retired ? (
                <>
                  <strong>Retirado por moderación</strong>
                  <p>
                    {current.retiredReason || 'Una denuncia se revisó y el proyecto dejó de verse.'} No se puede
                    actualizar; puedes dejar de publicarlo.
                  </p>
                </>
              ) : (
                <>
                  <strong>Es público</strong>
                  <p>
                    Publicado el {when(current.publishedAt)}
                    {current.version > 1 ? ` · última actualización el ${when(current.updatedAt)}` : ''}. Lo que cambies
                    ahora no se ve hasta «Publicar los cambios».
                  </p>
                  <div className="publish-link">
                    <code>{current.url}</code>
                    <Button size="sm" icon={Copy} onClick={() => void copyLink(current.url)}>
                      Copiar el enlace
                    </Button>
                    <a className="btn sm" href={current.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} aria-hidden /> Ver la página
                    </a>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
        {!current && current !== undefined && (
          <p className="muted-note">
            Cualquiera con el enlace podrá ver una copia de «{project.name}» (mapa, Tabla, Cronología y fichas), también
            sin cuenta, y nadie podrá cambiarla. Lo que edites después no sale hasta que publiques los cambios.
          </p>
        )}
        {!retired && (
          <>
            <label className="field">
              Descripción
              <textarea
                ref={descriptionRef}
                value={description}
                maxLength={1000}
                rows={3}
                placeholder="De qué trata, para quien lo abra"
                onChange={e => setDescription(e.target.value)}
              />
            </label>
            <fieldset className="publish-options">
              <legend>Qué se publica</legend>
              <label className="field-inline">
                <input
                  type="checkbox"
                  checked={options.notes}
                  onChange={e => setOptions({ ...options, notes: e.target.checked })}
                />
                Las notas de las fichas
              </label>
              <label className="field-inline">
                <input
                  type="checkbox"
                  checked={options.images}
                  onChange={e => setOptions({ ...options, images: e.target.checked })}
                />
                Las imágenes (retratos y fondo del mapa)
              </label>
              <label className="field-inline">
                <input type="checkbox" checked={allowCopy} onChange={e => setAllowCopy(e.target.checked)} />
                Dejar que otras personas hagan una copia para ellas
              </label>
              <div className="field">
                Tipos que no se publican (con sus subtipos)
                <MultiSelect
                  options={typeOptions}
                  value={options.excludedTypeIds}
                  onChange={excludedTypeIds => setOptions({ ...options, excludedTypeIds })}
                  addLabel="Dejar fuera un tipo"
                  emptyText="Se publican todos"
                />
              </div>
            </fieldset>
            <p className="muted-note" aria-live="polite">
              Se publicarán {summary.nodes} nodos y {summary.relations} relaciones
              {summary.leftOutNodes ? ` (${summary.leftOutNodes} nodos quedan fuera)` : ''}.
              {summary.hiddenNotes ? ` Las notas de ${summary.hiddenNotes} fichas no salen.` : ''}
              {summary.agenda ? ' La agenda nunca se publica.' : ''} Quienes te siguen verán la novedad en Nodaria y en
              la web social; puedes apagarlo en{' '}
              <a className="social-link" href={SOCIAL_NEWS} target="_blank" rel="noreferrer">
                <YosiSymbol size={14} /> tu cuenta de Yosiftware
              </a>
              .
            </p>
          </>
        )}
        {current && (
          <div>
            <Button variant="danger" disabled={busy} onClick={() => void unpublish()}>
              Dejar de publicar
            </Button>
          </div>
        )}
        {error && (
          <p className="group-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
