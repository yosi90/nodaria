/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMyRequests, markRequestRead, type OwnRequest } from '../services/api';
import { useAuth } from './auth';

export type RequestsTab = 'board' | 'mine' | 'new';

interface RequestsContextValue {
  /** Pestaña abierta del diálogo de peticiones, o ninguna. */
  tab: RequestsTab | null;
  open: (tab?: RequestsTab) => void;
  close: () => void;
  /** Peticiones del usuario con sesión (vacío sin sesión). */
  mine: OwnRequest[];
  unread: number;
  refreshMine: () => Promise<void>;
  /** Marca como leídas las respuestas pendientes de las peticiones propias. */
  markAllRead: () => Promise<void>;
}

const Context = createContext<RequestsContextValue | null>(null);
// Las respuestas llegan desde el panel del propietario: basta con mirar de vez en cuando.
const REFRESH_MS = 10 * 60 * 1000;

export function RequestsProvider({ children }: { children: ReactNode }) {
  const { status, getToken } = useAuth();
  const [tab, setTab] = useState<RequestsTab | null>(null);
  const [mine, setMine] = useState<OwnRequest[]>([]);
  const signedIn = status === 'signed-in';

  const refreshMine = useCallback(async () => {
    const token = signedIn ? await getToken() : null;
    if (!token) {
      setMine([]);
      return;
    }
    try {
      setMine((await fetchMyRequests(token)).requests);
    } catch {
      // Sin conexión o API caída: se conserva lo último conocido.
    }
  }, [signedIn, getToken]);

  useEffect(() => {
    // Primera carga al iniciar sesión (o vaciado al cerrarla), diferida fuera del efecto.
    const first = window.setTimeout(() => void refreshMine(), 0);
    if (!signedIn) return () => window.clearTimeout(first);
    const timer = window.setInterval(() => void refreshMine(), REFRESH_MS);
    const onFocus = () => document.visibilityState === 'visible' && void refreshMine();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [signedIn, refreshMine]);

  const markAllRead = useCallback(async () => {
    const pending = mine.filter(request => request.unread);
    const token = pending.length > 0 ? await getToken() : null;
    if (!token) return;
    await Promise.all(pending.map(request => markRequestRead(token, request.id).catch(() => undefined)));
    setMine(current => current.map(request => ({ ...request, unread: false })));
  }, [mine, getToken]);

  const open = useCallback((next: RequestsTab = 'board') => setTab(next), []);
  const close = useCallback(() => setTab(null), []);
  const unread = mine.filter(request => request.unread).length;

  const value = useMemo<RequestsContextValue>(
    () => ({ tab, open, close, mine, unread, refreshMine, markAllRead }),
    [tab, open, close, mine, unread, refreshMine, markAllRead],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRequests() {
  const value = useContext(Context);
  if (!value) throw new Error('useRequests debe usarse dentro de RequestsProvider');
  return value;
}
