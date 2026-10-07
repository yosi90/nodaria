import type { RequestStatus, RequestUpdate } from '../../services/api';
import { dateText, STATUS_LABELS } from './labels';

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge request-status status-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** Historial de respuestas del propietario: estado y mensaje. */
export function Updates({ updates }: { updates: RequestUpdate[] }) {
  if (updates.length === 0) return null;
  return (
    <ol className="request-updates">
      {updates.map(update => (
        <li key={update.id}>
          <span className="request-update-head">
            <StatusBadge status={update.status} /> <time dateTime={update.createdAt}>{dateText(update.createdAt)}</time>
          </span>
          {update.message && <p>{update.message}</p>}
        </li>
      ))}
    </ol>
  );
}
