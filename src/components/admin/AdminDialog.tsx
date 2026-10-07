import { ArrowLeft, Bug, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminRequests,
  respondAdminRequest,
  type AdminRequest,
  type RequestKind,
  type RequestStatus,
} from '../../services/api';
import { useAuth } from '../../state/auth';
import { useRequests } from '../../state/requests';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';
import { dateText, errorText, STATUS_LABELS } from '../requests/labels';
import { StatusBadge, Updates } from '../requests/RequestParts';

// Estados que se pueden asignar al responder (`revision` es solo el de entrada).
const ANSWER_STATUSES: RequestStatus[] = [
  'abierta',
  'planificada',
  'en_curso',
  'hecha',
  'descartada',
  'duplicada',
  'rechazada',
];
const IDEA_HINTS: Partial<Record<RequestStatus, string>> = {
  abierta: 'Se publica en el tablón y admite votos.',
  planificada: 'Pública y con votos.',
  en_curso: 'Pública y con votos.',
  hecha: 'Pública; deja de admitir votos.',
  descartada: 'Pública como descartada; deja de admitir votos. Explica el motivo.',
  duplicada: 'Pública y enlazada a la original; deja de admitir votos.',
  rechazada: 'No se publica nunca (spam o fuera de lugar). El autor ve el estado y el mensaje.',
};

const newKey = () => `web-${crypto.randomUUID()}`;
const authorText = (request: AdminRequest) =>
  [request.author.displayName, request.author.email && `<${request.author.email}>`].filter(Boolean).join(' ') ||
  'Usuario sin nombre';

/** Panel de administración: revisar y responder las peticiones de los usuarios. */
export function AdminDialog() {
  const { setAdminOpen } = useRequests();
  const { getToken } = useAuth();
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [kind, setKind] = useState<RequestKind | null>(null);
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [items, setItems] = useState<AdminRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminRequest | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error('Sin sesión');
        const page = await fetchAdminRequests(token, { scope, status, kind, offset });
        setItems(current => (offset === 0 ? page.items : [...current, ...page.items]));
        setTotal(page.total);
      } catch (failure) {
        setError(errorText(failure));
      } finally {
        setLoading(false);
      }
    },
    [scope, status, kind, getToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(0), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const answered = (request: AdminRequest) => {
    setSelected(request);
    setItems(current => current.map(item => (item.id === request.id ? request : item)));
  };

  return (
    <Modal title="Administración" wide informational onClose={() => setAdminOpen(false)}>
      {selected ? (
        <AdminDetail key={selected.id} request={selected} onBack={() => setSelected(null)} onAnswered={answered} />
      ) : (
        <div className="requests-board">
          <div className="requests-toolbar">
            <div className="segmented" role="group" aria-label="Qué peticiones">
              <button type="button" aria-pressed={scope === 'open'} onClick={() => setScope('open')}>
                <span className="label">Por atender</span>
              </button>
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                <span className="label">Todas</span>
              </button>
            </div>
            <div className="admin-filters">
              <Select
                compact
                aria-label="Tipo"
                nullLabel="Ideas y errores"
                value={kind}
                onChange={value => setKind(value as RequestKind | null)}
                options={[
                  { value: 'idea', label: 'Ideas' },
                  { value: 'error', label: 'Errores' },
                ]}
              />
              <Select
                compact
                aria-label="Estado"
                nullLabel="Todos los estados"
                value={status}
                onChange={value => setStatus(value as RequestStatus | null)}
                options={(Object.keys(STATUS_LABELS) as RequestStatus[]).map(value => ({
                  value,
                  label: STATUS_LABELS[value],
                }))}
              />
            </div>
          </div>
          {error && (
            <p className="validation-message" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="requests-empty">
              <p>{scope === 'open' ? 'No hay peticiones por atender.' : 'No hay peticiones con estos filtros.'}</p>
            </div>
          )}
          <ul className="request-list">
            {items.map(item => (
              <li key={item.id}>
                <button type="button" className="request-card admin-row" onClick={() => setSelected(item)}>
                  <span className="request-kind" aria-hidden>
                    {item.kind === 'idea' ? <Lightbulb size={16} /> : <Bug size={16} />}
                  </span>
                  <span className="request-main">
                    <span className="request-title static">{item.title}</span>
                    <span className="request-meta">
                      <StatusBadge status={item.status} />
                      <span>
                        {item.kind === 'idea' ? 'Idea' : 'Error'} #{item.id}
                      </span>
                      {item.kind === 'idea' && <span>{item.votes} votos</span>}
                      <span>{authorText(item)}</span>
                      <time dateTime={item.createdAt}>{dateText(item.createdAt)}</time>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {items.length < total && (
            <Button disabled={loading} onClick={() => void load(items.length)}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}

function AdminDetail({
  request,
  onBack,
  onAnswered,
}: {
  request: AdminRequest;
  onBack: () => void;
  onAnswered: (request: AdminRequest) => void;
}) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<RequestStatus>(
    request.status === 'revision' ? (request.kind === 'idea' ? 'abierta' : 'en_curso') : request.status,
  );
  const [message, setMessage] = useState('');
  const [duplicateOf, setDuplicateOf] = useState(request.duplicateOf ? String(request.duplicateOf) : '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reintentar la misma respuesta tras un corte reutiliza la clave: el servidor no la duplica.
  const [pending, setPending] = useState<{ signature: string; key: string } | null>(null);

  const duplicateId = status === 'duplicada' ? Number(duplicateOf) : null;
  const duplicateValid =
    duplicateId === null || (Number.isInteger(duplicateId) && duplicateId > 0 && duplicateId !== request.id);
  const changed = status !== request.status || message.trim() !== '' || duplicateId !== request.duplicateOf;

  const send = async () => {
    const response = { status, message: message.trim() || null, duplicateOf: duplicateId };
    const signature = JSON.stringify(response);
    const key = pending?.signature === signature ? pending.key : newKey();
    setPending({ signature, key });
    setSending(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sin sesión');
      const { replayed, ...updated } = await respondAdminRequest(token, request.id, response, key);
      setPending(null);
      setMessage('');
      onAnswered(updated);
      toast({ message: replayed ? 'Esa respuesta ya estaba registrada.' : 'Respuesta guardada.' });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-detail">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>
        Volver a la lista
      </Button>
      <div className="request-main">
        <h3 className="admin-title">{request.title}</h3>
        <div className="request-meta">
          <StatusBadge status={request.status} />
          <span>
            {request.kind === 'idea' ? 'Idea' : 'Error'} #{request.id}
          </span>
          {request.kind === 'idea' && <span>{request.votes} votos</span>}
          {request.duplicateOf && <span>Duplicada de #{request.duplicateOf}</span>}
          <span>{authorText(request)}</span>
          <time dateTime={request.createdAt}>{dateText(request.createdAt)}</time>
        </div>
        <p className="request-body">{request.body}</p>
        {request.updatesTotal > request.updates.length && (
          <small className="muted-note">
            Se muestran las {request.updates.length} últimas respuestas de {request.updatesTotal}.
          </small>
        )}
        <Updates updates={request.updates} />
      </div>
      <div className="request-form admin-answer">
        <h4>Responder</h4>
        <label className="field">
          Estado
          <Select
            value={status}
            onChange={value => value && setStatus(value as RequestStatus)}
            options={ANSWER_STATUSES.map(value => ({ value, label: STATUS_LABELS[value] }))}
          />
          <small>
            {request.kind === 'idea'
              ? IDEA_HINTS[status]
              : 'Los errores nunca se publican: solo el autor ve el estado y el mensaje.'}
          </small>
        </label>
        {status === 'duplicada' && (
          <label className="field">
            Número de la petición original
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={duplicateOf}
              onChange={event => setDuplicateOf(event.target.value)}
            />
          </label>
        )}
        <label className="field">
          Mensaje público
          <textarea
            rows={4}
            maxLength={2000}
            value={message}
            placeholder={
              request.kind === 'idea'
                ? 'Opcional. Lo verá el autor y, si la idea está publicada, cualquiera en el tablón.'
                : 'Opcional. Solo lo verá el autor del aviso.'
            }
            onChange={event => setMessage(event.target.value)}
          />
        </label>
        {error && (
          <p className="validation-message" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button variant="primary" disabled={sending || !changed || !duplicateValid} onClick={() => void send()}>
            {sending ? 'Guardando…' : 'Guardar respuesta'}
          </Button>
        </div>
      </div>
    </div>
  );
}
