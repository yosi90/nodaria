/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSdk, sdk, type PlatformState } from '../services/yosiftware';
import { platformStyles } from '../services/yosiftwareStyles';

/*
 * Sesión de la cuenta de Yosiftware. La gestiona el SDK de la plataforma: entrar, salir, el perfil y
 * la sesión compartida entre webs. Entrar es opcional; sin sesión, Nodaria funciona en local.
 */

/** Lo que la interfaz necesita saber de la cuenta. */
export interface AccountUser {
  /** Identificador global de la cuenta (el `sub` de los tokens). */
  id: string;
  alias: string;
  email: string | null;
}

/** `unavailable`: la plataforma no responde o su SDK no ha cargado; Nodaria sigue en local. */
export type AuthStatus = 'loading' | 'signed-out' | 'unavailable' | 'signed-in';

export interface AccountRestrictions {
  /** Alcances limitados por moderación; en Nodaria importa `creacion` (subir proyectos nuevos). */
  scopes: string[];
  until: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AccountUser | null;
  restrictions: AccountRestrictions | null;
  /** Token para la API de Nodaria, renovado por el SDK; `null` sin sesión. No se guarda. */
  getToken: () => Promise<string | null>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Context = createContext<AuthContextValue | null>(null);

function fromState(state: PlatformState | null): Pick<AuthContextValue, 'status' | 'user' | 'restrictions'> {
  if (!state || state.tipo === 'no_disponible') return { status: 'unavailable', user: null, restrictions: null };
  if (state.tipo === 'comprobando') return { status: 'loading', user: null, restrictions: null };
  if (state.tipo !== 'con_sesion') return { status: 'signed-out', user: null, restrictions: null };
  return {
    status: 'signed-in',
    user: { id: state.cuenta.id.toLowerCase(), alias: state.cuenta.alias, email: state.cuenta.correo ?? null },
    restrictions: state.restricciones
      ? { scopes: state.restricciones.alcances, until: state.restricciones.hasta }
      : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(() => fromState({ tipo: 'comprobando' }));

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void loadSdk().then(found => {
      if (cancelled) return;
      if (!found) {
        setSnapshot(fromState(null));
        return;
      }
      // El aspecto de Nodaria en las ventanas y paneles del SDK (ecosistema-kit/ESTILOS.md).
      void found.estilos?.({ css: platformStyles(window.location.origin) }).catch(() => undefined);
      // alCambiar llama al momento con el estado actual y después en cada cambio (también desde otras webs).
      stop = found.alCambiar(state =>
        setSnapshot(current => {
          const next = fromState(state);
          // El mismo estado no vuelve a pintar ni reinicia la sincronización.
          return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        }),
      );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const getToken = useCallback(async () => (await sdk()?.token()) ?? null, []);
  const signIn = useCallback(async () => {
    await sdk()?.entrar();
  }, []);
  const signOut = useCallback(async () => {
    await sdk()?.salir();
  }, []);

  const value = useMemo(() => ({ ...snapshot, getToken, signIn, signOut }), [snapshot, getToken, signIn, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
