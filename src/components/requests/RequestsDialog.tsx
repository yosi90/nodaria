import { Bug, ChevronUp, Lightbulb, LogIn } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createRequest,
  fetchBoard,
  fetchRequest,
  voteRequest,
  type BoardRequest,
  type RequestKind,
  type RequestStatus,
  type RequestUpdate,
} from '../../services/api';
import { useAuth } from '../../state/auth';
import { useRequests, type RequestsTab } from '../../state/requests';
import { Button } from '../common/Button';
import { LegalLinks } from '../common/LegalLinks';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';
import { dateText, errorText, STATUS_LABELS } from './labels';
import { StatusBadge, Updates } from './RequestParts';

const VOTABLE: RequestStatus[] = ['abierta', 'planificada', 'en_curso'];
const BOARD_FILTERS: RequestStatus[] = ['abierta', 'planificada', 'en_curso', 'hecha', 'descartada'];

const TABS: { id: RequestsTab; label: string }[] = [
  { id: 'board', label: 'Tablón' },
  { id: 'mine', label: 'Mis peticiones' },
  { id: 'new', label: 'Nueva' },
];

/** Ideas y peticiones: tablón público con votos, peticiones propias y formulario de envío. */
export function RequestsDialog({ onSignIn }: { onSignIn: () => void }) {
  const { tab, open, close } = useRequests();
  const [draft, setDraft] = useState<{ kind: RequestKind; title: string; body: string }>({
    kind: 'idea',
    title: '',
    body: '',
  });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const { status, getToken } = useAuth();
  const { refreshMine } = useRequests();
  const toast = useToast();
  if (!tab) return null;

  const canSend =
    status === 'signed-in' && !sending && draft.title.trim().length >= 4 && draft.body.trim().length >= 10;

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sin sesión');
      await createRequest(token, { kind: draft.kind, title: draft.title.trim(), body: draft.body.trim() });
      setDraft({ kind: draft.kind, title: '', body: '' });
      await refreshMine();
      toast({
        message:
          draft.kind === 'idea'
            ? 'Idea enviada. Se publicará en el tablón cuando la revisemos.'
            : 'Error enviado. Gracias por avisar.',
      });
      open('mine');
    } catch (error) {
      setSendError(errorText(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Ideas y peticiones"
      wide
      informational={tab !== 'new' || status !== 'signed-in'}
      submitLabel={sending ? 'Enviando…' : 'Enviar'}
      submitDisabled={!canSend}
      onSubmit={() => void send()}
      onClose={close}
    >
      <div className="segmented requests-tabs" role="tablist" aria-label="Secciones de peticiones">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => open(t.id)}>
            <span className="label">{t.label}</span>
          </button>
        ))}
      </div>
      {tab === 'board' ? (
        <Board onSignIn={onSignIn} />
      ) : tab === 'mine' ? (
        <Mine onSignIn={onSignIn} />
      ) : (
        <NewRequestForm draft={draft} onDraft={setDraft} error={sendError} disabled={sending} onSignIn={onSignIn} />
      )}
    </Modal>
  );
}

function SignInPrompt({ text, onSignIn }: { text: string; onSignIn: () => void }) {
  const { status } = useAuth();
  return (
    <div className="requests-empty">
      <p>{status === 'unverified' ? 'Confirma tu correo electrónico para activar la cuenta.' : text}</p>
      {status === 'signed-out' && (
        <Button variant="primary" icon={LogIn} onClick={onSignIn}>
          Iniciar sesión o crear cuenta
        </Button>
      )}
    </div>
  );
}

function Board({ onSignIn }: { onSignIn: () => void }) {
  const { status, getToken } = useAuth();
  const toast = useToast();
  const [sort, setSort] = useState<'votes' | 'recent'>('votes');
  const [filter, setFilter] = useState<RequestStatus | null>(null);
  const [items, setItems] = useState<BoardRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [updates, setUpdates] = useState<Record<number, RequestUpdate[]>>({});
  const signedIn = status === 'signed-in';

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const token = signedIn ? await getToken() : null;
        const page = await fetchBoard(token, { sort, status: filter, offset });
        setItems(current => (offset === 0 ? page.items : [...current, ...page.items]));
        setTotal(page.total);
      } catch (failure) {
        setError(errorText(failure));
      } finally {
        setLoading(false);
      }
    },
    [sort, filter, signedIn, getToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggle = async (item: BoardRequest) => {
    const next = expanded === item.id ? null : item.id;
    setExpanded(next);
    if (next === null || updates[item.id]) return;
    try {
      const detail = await fetchRequest(signedIn ? await getToken() : null, item.id);
      setUpdates(current => ({ ...current, [item.id]: detail.updates }));
    } catch {
      // El detalle es un extra: sin él se sigue viendo la idea.
    }
  };

  const vote = async (item: BoardRequest) => {
    if (!signedIn) return onSignIn();
    try {
      const token = await getToken();
      if (!token) return;
      const result = await voteRequest(token, item.id, !item.voted);
      setItems(current =>
        current.map(other => (other.id === item.id ? { ...other, votes: result.votes, voted: result.voted } : other)),
      );
    } catch (failure) {
      toast({ message: errorText(failure) });
    }
  };

  return (
    <div className="requests-board">
      <p className="muted-note">
        Ideas de quienes usan Nodaria, ya revisadas. Vota las que te gustaría ver; las más apoyadas tienen prioridad.
      </p>
      <div className="requests-toolbar">
        <div className="segmented" role="group" aria-label="Orden">
          <button type="button" aria-pressed={sort === 'votes'} onClick={() => setSort('votes')}>
            Más votadas
          </button>
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>
            Recientes
          </button>
        </div>
        <Select
          compact
          aria-label="Filtrar por estado"
          nullLabel="Todos los estados"
          value={filter}
          onChange={value => setFilter(value as RequestStatus | null)}
          options={BOARD_FILTERS.map(value => ({ value, label: STATUS_LABELS[value] }))}
        />
      </div>
      {error && (
        <p className="validation-message" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="requests-empty">
          <p>Todavía no hay ideas publicadas{filter ? ' en este estado' : ''}.</p>
        </div>
      )}
      <ul className="request-list">
        {items.map(item => {
          const votable = VOTABLE.includes(item.status);
          return (
            <li key={item.id} className="request-card">
              <button
                type="button"
                className={`request-vote ${item.voted ? 'voted' : ''}`}
                aria-pressed={item.voted}
                disabled={!votable}
                aria-label={`${item.voted ? 'Quitar mi voto' : 'Votar'}: ${item.votes} votos`}
                data-tooltip={
                  votable
                    ? signedIn
                      ? item.voted
                        ? 'Quitar mi voto'
                        : 'Votar'
                      : 'Inicia sesión para votar'
                    : 'Ya no admite votos'
                }
                onClick={() => void vote(item)}
              >
                <ChevronUp size={16} aria-hidden />
                <span>{item.votes}</span>
              </button>
              <div className="request-main">
                <button
                  type="button"
                  className="request-title"
                  aria-expanded={expanded === item.id}
                  onClick={() => void toggle(item)}
                >
                  {item.title}
                </button>
                <div className="request-meta">
                  <StatusBadge status={item.status} />
                  {item.mine && <span className="badge accent">Tuya</span>}
                  <time dateTime={item.createdAt}>{dateText(item.createdAt)}</time>
                </div>
                <p className={`request-body ${expanded === item.id ? '' : 'clamped'}`}>{item.body}</p>
                {expanded === item.id && <Updates updates={updates[item.id] ?? []} />}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length < total && (
        <Button disabled={loading} onClick={() => void load(items.length)}>
          {loading ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </div>
  );
}

function Mine({ onSignIn }: { onSignIn: () => void }) {
  const { status } = useAuth();
  const { mine, markAllRead, refreshMine } = useRequests();
  // Al abrir la pestaña se refresca y se dan por vistas las respuestas.
  const [unreadIds] = useState(() => new Set(mine.filter(request => request.unread).map(request => request.id)));
  useEffect(() => {
    if (status !== 'signed-in') return;
    const timer = window.setTimeout(() => void refreshMine().then(markAllRead), 0);
    return () => window.clearTimeout(timer);
    // Solo al montar: markAllRead cambia con la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status !== 'signed-in') {
    return <SignInPrompt text="Inicia sesión para ver tus peticiones y sus respuestas." onSignIn={onSignIn} />;
  }
  if (mine.length === 0) {
    return (
      <div className="requests-empty">
        <p>Aún no has enviado ninguna petición.</p>
      </div>
    );
  }
  return (
    <ul className="request-list">
      {mine.map(request => (
        <li key={request.id} className={`request-card own ${unreadIds.has(request.id) ? 'unread' : ''}`}>
          <span className="request-kind" aria-hidden>
            {request.kind === 'idea' ? <Lightbulb size={16} /> : <Bug size={16} />}
          </span>
          <div className="request-main">
            <span className="request-title static">{request.title}</span>
            <div className="request-meta">
              <StatusBadge status={request.status} />
              <span>{request.kind === 'idea' ? 'Idea' : 'Error'}</span>
              {request.kind === 'idea' && <span>{request.votes} votos</span>}
              <time dateTime={request.createdAt}>{dateText(request.createdAt)}</time>
              {unreadIds.has(request.id) && <span className="badge accent">Respuesta nueva</span>}
            </div>
            <p className="request-body">{request.body}</p>
            <Updates updates={request.updates} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NewRequestForm({
  draft,
  onDraft,
  error,
  disabled,
  onSignIn,
}: {
  draft: { kind: RequestKind; title: string; body: string };
  onDraft: (draft: { kind: RequestKind; title: string; body: string }) => void;
  error: string | null;
  disabled: boolean;
  onSignIn: () => void;
}) {
  const { status } = useAuth();
  if (status !== 'signed-in') {
    return <SignInPrompt text="Para proponer ideas o avisar de errores necesitas una cuenta." onSignIn={onSignIn} />;
  }
  return (
    <div className="request-form">
      <div className="segmented" role="group" aria-label="Tipo de petición">
        <button type="button" aria-pressed={draft.kind === 'idea'} onClick={() => onDraft({ ...draft, kind: 'idea' })}>
          <Lightbulb size={14} aria-hidden /> Idea
        </button>
        <button
          type="button"
          aria-pressed={draft.kind === 'error'}
          onClick={() => onDraft({ ...draft, kind: 'error' })}
        >
          <Bug size={14} aria-hidden /> Error
        </button>
      </div>
      <p className="muted-note">
        {draft.kind === 'idea'
          ? 'Las ideas se publican en el tablón, sin tu nombre, cuando las revisamos. Así otras personas pueden apoyarlas.'
          : 'Los errores no se publican: solo los vemos tú y nosotros. Cuenta qué hacías, qué esperabas y qué pasó.'}
      </p>
      <label className="field">
        Título
        <input
          value={draft.title}
          maxLength={120}
          autoFocus
          disabled={disabled}
          placeholder={
            draft.kind === 'idea' ? 'Por ejemplo: exportar el mapa a PDF' : 'Por ejemplo: la tabla no guarda las fechas'
          }
          onChange={event => onDraft({ ...draft, title: event.target.value })}
        />
      </label>
      <label className="field">
        Descripción
        <textarea
          rows={7}
          value={draft.body}
          maxLength={4000}
          disabled={disabled}
          onChange={event => onDraft({ ...draft, body: event.target.value })}
        />
        <small>{draft.body.length} / 4000</small>
      </label>
      {error && (
        <p className="validation-message" role="alert">
          {error}
        </p>
      )}
      <LegalLinks prefix="Al enviar aceptas las " />
    </div>
  );
}
