import { Copy, ExternalLink, FolderOpen, Globe, Share2 } from 'lucide-react';
import { useCallback } from 'react';
import { myPublications, type OwnPublication } from '../../services/community';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useNavigation } from '../../state/navigation';
import { Button } from '../common/Button';
import { openPublic, useCopyLink, useLoad } from './communityHelpers';
import { dateTimeText } from '../common/dates';

/** «Tus publicados»: lo que has hecho público, con su enlace, el de la vista previa y el proyecto del que sale. */
export function PublishedTab() {
  const { getToken } = useAuth();
  const { state, dispatch } = useApp();
  const { setView } = useNavigation();
  const load = useCallback(async () => {
    const token = await getToken();
    return token ? myPublications(token) : [];
  }, [getToken]);
  const { value, error } = useLoad<OwnPublication[]>(load);

  const copy = useCopyLink();
  const openProject = (projectId: string) => {
    dispatch({ type: 'set-project', id: projectId });
    setView('map');
  };

  return (
    <div className="community-page">
      <header className="community-page-head">
        <h2>Tus publicados</h2>
        <p className="muted-note">
          Para publicar un proyecto, ábrelo y elige «Publicar…» en sus ajustes (el engranaje junto a su nombre).
        </p>
      </header>
      {error && <p className="group-error">{error}</p>}
      {!value && !error && <p className="muted-note">Cargando…</p>}
      {value && !value.length && <p className="muted-note">No has publicado ningún proyecto.</p>}
      <div className="public-grid">
        {value?.map(p => (
          <article key={p.id} className={`public-card ${p.state === 'retirado' ? 'retired' : ''}`}>
            {p.imageUrl && (
              <button type="button" className="public-card-image" onClick={() => openPublic(p.id)}>
                <img src={p.imageUrl} alt="" loading="lazy" />
              </button>
            )}
            <header>
              <Globe size={16} aria-hidden />
              <strong>{p.name}</strong>
              {p.state === 'retirado' && <span className="badge">Retirado por moderación</span>}
            </header>
            <p className="muted">
              {p.nodeCount} nodos · {p.relationCount} relaciones · actualizado el {dateTimeText(p.updatedAt)}
            </p>
            <div className="public-card-actions">
              {p.state === 'publico' && (
                <>
                  <Button size="sm" icon={ExternalLink} onClick={() => openPublic(p.id)}>
                    Ver
                  </Button>
                  <Button size="sm" icon={Copy} onClick={() => void copy(p.url)}>
                    Enlace
                  </Button>
                  {p.shareUrl && (
                    <Button size="sm" icon={Share2} onClick={() => void copy(p.shareUrl!)}>
                      Enlace con vista previa
                    </Button>
                  )}
                </>
              )}
              {state.projects.some(project => project.id === p.projectId) && (
                <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openProject(p.projectId)}>
                  Abrir el proyecto
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
