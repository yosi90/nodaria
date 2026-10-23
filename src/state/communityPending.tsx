/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { communityPending } from '../services/community';
import { useAuth } from './auth';

const EVERY_MS = 60_000;
const NONE = { unread: 0, requests: 0 };

const Context = createContext(NONE);

/**
 * Lo pendiente en Comunidad para el botón de la barra y el menú de la vista: mensajes sin leer y solicitudes
 * de amistad recibidas. Se pregunta a la plataforma cada minuto y al volver a la pestaña; sin sesión, nada.
 * Lo de otra cuenta no se enseña nunca (`CAMBIO_DE_CUENTA.md`): se guarda con la cuenta a la que pertenece.
 */
export function CommunityPendingProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const signedIn = status === 'signed-in' && user !== null;
  const account = user?.id ?? null;
  const [pending, setPending] = useState({ ...NONE, account: null as string | null });

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const check = () =>
      void communityPending().then(
        result => alive && setPending({ ...result, account }),
        () => undefined,
      );
    check();
    const timer = window.setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, account]);

  const value = signedIn && pending.account === account ? pending : NONE;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useCommunityPending = () => useContext(Context);
