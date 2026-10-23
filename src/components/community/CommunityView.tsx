import { ArrowLeft, Compass, Globe, Home, MessageSquare, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../../state/auth';
import { useNavigation, type CommunityTab } from '../../state/navigation';
import { Button } from '../common/Button';
import { YosiSymbol } from '../common/YosiSymbol';
import { ChatsTab } from './ChatsTab';
import { DiscoverTab } from './DiscoverTab';
import { FeedTab } from './FeedTab';
import { PeopleTab } from './PeopleTab';
import { PersonTab } from './PersonTab';
import { PublishedTab } from './PublishedTab';
import { useCommunityPending } from '../../state/communityPending';

const SOCIAL = 'https://social.yosiftware.es/';

const TABS: { id: Exclude<CommunityTab, 'persona'>; label: string; icon: typeof Home; signedIn: boolean }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home, signedIn: true },
  { id: 'descubrir', label: 'Descubrir', icon: Compass, signedIn: false },
  { id: 'personas', label: 'Personas', icon: Users, signedIn: true },
  { id: 'chats', label: 'Chats', icon: MessageSquare, signedIn: true },
  { id: 'publicados', label: 'Tus publicados', icon: Globe, signedIn: true },
];

/**
 * La sección «Comunidad» (docs/roadmaps/ROADMAP_COMUNIDAD.md): una vista a pantalla completa, fuera de las
 * del proyecto, con el feed de novedades de Nodaria, lo que hay para descubrir, las personas (buscar,
 * seguir, amistades), los chats de la plataforma y lo que has publicado. Seguir, las amistades, los
 * «me gusta», los comentarios y los mensajes son de la plataforma: Nodaria no guarda nada de eso.
 */
export function CommunityView() {
  const { community, openCommunity, setView, projectView } = useNavigation();
  const { status, user, signIn } = useAuth();
  const signedIn = status === 'signed-in' && user !== null;
  const pending = useCommunityPending();
  const tab = community.tab;
  const needsSession = tab === 'persona' || TABS.find(t => t.id === tab)?.signedIn;

  let content: ReactNode;
  if (needsSession && !signedIn)
    content = (
      <div className="community-empty">
        <p>
          Entra con tu cuenta de Yosiftware para ver las novedades de quienes sigues, buscar personas, chatear y
          publicar tus proyectos. Sin cuenta puedes ver lo que hay en «Descubrir».
        </p>
        <div className="community-empty-actions">
          <Button variant="primary" onClick={() => void signIn()}>
            Entrar
          </Button>
          <Button onClick={() => openCommunity({ tab: 'descubrir' })}>Ir a Descubrir</Button>
        </div>
      </div>
    );
  else if (tab === 'inicio') content = <FeedTab />;
  else if (tab === 'descubrir') content = <DiscoverTab signedIn={signedIn} />;
  else if (tab === 'personas') content = <PeopleTab />;
  else if (tab === 'chats') content = <ChatsTab conversation={community.conversation} />;
  else if (tab === 'publicados') content = <PublishedTab />;
  else content = community.person ? <PersonTab key={community.person} id={community.person} /> : <PeopleTab />;

  const badge = (id: CommunityTab) => (id === 'chats' ? pending.unread : id === 'personas' ? pending.requests : 0);

  return (
    <main className={`community-view ${tab === 'chats' ? 'with-chats' : ''}`} aria-label="Comunidad">
      <nav className="community-nav" aria-label="Secciones de Comunidad">
        <h1>
          <Globe size={18} aria-hidden /> Comunidad
        </h1>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => openCommunity({ tab: t.id })}
          >
            <t.icon size={16} aria-hidden />
            <span className="label">{t.label}</span>
            {badge(t.id) > 0 && (
              <span className="community-badge" aria-label={`${badge(t.id)} pendientes`}>
                {badge(t.id) > 99 ? '99+' : badge(t.id)}
              </span>
            )}
          </button>
        ))}
        <div className="community-nav-foot">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setView(projectView)}>
            Volver al proyecto
          </Button>
          <a className="social-link" href={SOCIAL} target="_blank" rel="noreferrer">
            <YosiSymbol size={14} /> Tu cuenta de Yosiftware
          </a>
        </div>
      </nav>
      <section className="community-content">{content}</section>
    </main>
  );
}
