import { CalendarRange, Copy, Flag, Network, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../domain/types';
import { ApiError, OfflineError } from '../../services/api';
import {
  fetchPublic,
  personName,
  personProfile,
  publicPath,
  type Person,
  type PublicProject,
} from '../../services/community';
import { parseProject } from '../../services/storage';
import { StaticAppProvider, type ActionGuard } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { ReadOnlyProject } from '../../state/groups';
import { NavigationProvider, useNavigation, type View } from '../../state/navigation';
import { Button } from '../common/Button';
import { DialogProvider } from '../common/dialogs';
import { ToastProvider } from '../common/toasts';
import { Logo } from '../common/Logo';
import { EcosystemWebs } from '../layout/EcosystemWebs';
import { MapView } from '../map/MapView';
import { TableView } from '../table/TableView';
import { TimelineView } from '../timeline/TimelineView';
import { FollowButton } from './FollowButton';
import { ReportDialog } from './ReportDialog';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** El botón de la cuenta del SDK, con su panel de cuentas (`ecosistema-kit/ACCESO.md`). */
      'yosi-acceso': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

/** En la página pública solo se cambia cómo se mira (disposición, filtros, vistas guardadas): nada se guarda. */
const VIEW_ACTIONS = new Set(['update-view', 'apply-lens', 'set-project']);
const readOnlyGuard: ActionGuard = action => VIEW_ACTIONS.has(action.type);

const VIEWS: { id: View; label: string; icon: typeof Network }[] = [
  { id: 'map', label: 'Mapa', icon: Network },
  { id: 'table', label: 'Tabla', icon: Table2 },
  { id: 'timeline', label: 'Cronología', icon: CalendarRange },
];

type Loaded = { publication: PublicProject; project: Project };

/**
 * La página pública de un proyecto (`/p/<id>`, docs/roadmaps/ROADMAP_COMUNIDAD.md): se abre con el enlace,
 * también sin sesión, y enseña el mapa, la Tabla, la Cronología y las fichas sin ningún control de edición.
 * No lee ni toca los proyectos del navegador de quien mira.
 */
export function PublicApp({ publicId }: { publicId: string }) {
  const [loaded, setLoaded] = useState<Loaded | { error: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublic(publicId).then(
      publication => {
        if (!alive) return;
        // Se migra y repara como cualquier proyecto que entra, por si se publicó con una versión anterior.
        const { project } = parseProject(JSON.stringify(publication.document));
        document.title = `${publication.name} · Nodaria`;
        setLoaded({ publication, project });
      },
      (error: unknown) =>
        alive &&
        setLoaded({
          error:
            error instanceof ApiError && error.status === 404
              ? 'Este proyecto ya no es público o el enlace no es correcto.'
              : error instanceof OfflineError
                ? 'No hay conexión con Nodaria. Vuelve a intentarlo en un momento.'
                : 'No se ha podido abrir este proyecto.',
        }),
    );
    return () => {
      alive = false;
    };
  }, [publicId]);

  if (!loaded) return <PublicShell title="Abriendo el proyecto…" />;
  if ('error' in loaded) return <PublicShell title="No se puede abrir" message={loaded.error} />;
  return (
    <StaticAppProvider project={loaded.project} guard={readOnlyGuard}>
      <ToastProvider>
        <NavigationProvider>
          <DialogProvider>
            <ReadOnlyProject value>
              <PublicWorkspace publication={loaded.publication} />
            </ReadOnlyProject>
          </DialogProvider>
        </NavigationProvider>
      </ToastProvider>
    </StaticAppProvider>
  );
}

function PublicShell({ title, message }: { title: string; message?: string }) {
  return (
    <div className="app public-app">
      <PublicBar />
      <main className="public-message">
        <h1>{title}</h1>
        {message && <p>{message}</p>}
        {message && (
          <a className="btn primary" href="/">
            Ir a Nodaria
          </a>
        )}
      </main>
    </div>
  );
}

function PublicBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="topbar public-bar">
      <a className="brand" href="/" title="Abrir Nodaria">
        <span className="brand-mark" aria-hidden>
          <Logo size={18} />
        </span>
        <span className="brand-name">Nodaria</span>
      </a>
      {children}
      <div className="spacer" />
      <div className="topbar-actions">
        <EcosystemWebs />
        <yosi-acceso />
      </div>
    </header>
  );
}

function PublicWorkspace({ publication }: { publication: PublicProject }) {
  const { view, setView } = useNavigation();
  const { status, user, signIn } = useAuth();
  const signedIn = status === 'signed-in' && user !== null;
  const [reporting, setReporting] = useState(false);
  const own = signedIn && user?.id.toLowerCase() === publication.author;
  const shown = VIEWS.some(v => v.id === view) ? view : 'map';
  const updated = useMemo(
    () => new Date(publication.updatedAt).toLocaleDateString('es-ES', { dateStyle: 'long' }),
    [publication.updatedAt],
  );

  const copy = () => window.location.assign(`/?copiar=${encodeURIComponent(publication.id)}`);
  const report = () => (signedIn ? setReporting(true) : void signIn());

  return (
    <div className="app public-app">
      <PublicBar>
        <div className="public-title">
          <h1 title={publication.name}>{publication.name}</h1>
          <span className="public-badge">Público · solo lectura</span>
        </div>
        <span className="divider hide-narrow" aria-hidden />
        <nav className="segmented labeled views-nav" aria-label="Vistas">
          {VIEWS.map(v => (
            <button key={v.id} type="button" aria-pressed={shown === v.id} onClick={() => setView(v.id)}>
              <v.icon size={15} aria-hidden />
              <span className="label">{v.label}</span>
            </button>
          ))}
        </nav>
      </PublicBar>
      <section className="public-info">
        {/* Sin sesión no se ve quién lo publicó: los perfiles solo se ven con sesión en la plataforma. */}
        {signedIn ? (
          <Author key={user?.id} id={publication.author} own={own} />
        ) : (
          <span className="muted">
            <button type="button" className="link-button" onClick={() => void signIn()}>
              Entra
            </button>{' '}
            para ver quién lo publicó y seguir sus novedades.
          </span>
        )}
        <span className="muted">
          {publication.nodeCount} nodos · {publication.relationCount} relaciones · actualizado el {updated}
        </span>
        {publication.origin && (
          <span className="muted">
            Basado en{' '}
            <a href={publicPath(publication.origin.publicId)} target="_blank" rel="noreferrer">
              «{publication.origin.name}»
            </a>
          </span>
        )}
        {publication.description && <p className="public-description">{publication.description}</p>}
        <div className="spacer" />
        {publication.allowCopy && !own && (
          <Button size="sm" icon={Copy} onClick={copy}>
            Hacer una copia
          </Button>
        )}
        {!own && (
          <Button size="sm" variant="ghost" icon={Flag} onClick={report}>
            Denunciar
          </Button>
        )}
      </section>
      <div className="app-body">
        {shown === 'map' ? <MapView /> : shown === 'table' ? <TableView /> : <TimelineView />}
      </div>
      {reporting && (
        <ReportDialog publicId={publication.id} name={publication.name} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

/** Quién lo publicó, con «Seguir». Si no hay nadie (cuenta cerrada o un bloqueo), no se enseña nada. */
function Author({ id, own }: { id: string; own: boolean }) {
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    personProfile(id).then(
      found => alive && setPerson(found),
      () => alive && setPerson(null),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  if (!person) return null;
  return (
    <span className="public-author">
      {person.avatar ? (
        <img src={person.avatar.miniatura} alt="" width={24} height={24} />
      ) : (
        <span className="avatar-initial" aria-hidden>
          {person.alias.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span>
        {own ? (
          'Publicado por ti'
        ) : (
          <>
            De{' '}
            <a href={`/#comunidad/persona/${encodeURIComponent(id)}`} title="Ver su perfil en Comunidad">
              {personName(person)}
            </a>
          </>
        )}
      </span>
      {!own && <FollowButton personId={id} />}
    </span>
  );
}
