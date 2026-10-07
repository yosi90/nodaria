import { ApiError, OfflineError, type RequestStatus } from '../../services/api';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  revision: 'En revisión',
  rechazada: 'No publicada',
  abierta: 'Abierta',
  planificada: 'Planificada',
  en_curso: 'En curso',
  hecha: 'Hecha',
  descartada: 'Descartada',
  duplicada: 'Duplicada',
};

export const errorText = (error: unknown) =>
  error instanceof OfflineError
    ? 'Sin conexión con el servidor de Nodaria.'
    : error instanceof ApiError
      ? error.message
      : 'Algo ha fallado. Inténtalo de nuevo.';

export const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
