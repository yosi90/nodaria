/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createIdentityTracker, type Identity } from '../services/identity';
import { loadSdk, sdk, type PlatformState, type SavedAccount } from '../services/yosiftware';
import { platformStyles } from '../services/yosiftwareStyles';

/*
 * Sesión de la cuenta de Yosiftware. La gestiona el SDK de la plataforma: entrar, salir, el perfil, las
 * cuentas guardadas y la sesión compartida entre webs. Entrar es opcional; sin sesión, Nodaria funciona
 * en local.
 *
 * Cambio de cuenta (`ecosistema-kit/CAMBIO_DE_CUENTA.md`): A → B puede llegar sin cierre intermedio. Cada
 * cambio abre una generación de identidad nueva (`services/identity.ts`); los motores que trabajan con la
 * cuenta (sincronización, grupos) piden el token con `tokenFor(identidad)` y comprueban con `isCurrent`
 * antes de aplicar lo que reciben, así que nada empezado con A se pinta ni se sube como B.
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
  /** La identidad vigente (generación y cuenta), para atar a ella una operación larga. */
  identity: () => Identity;
  /** Si la identidad con la que empezó una operación sigue siendo la vigente. */
  isCurrent: (identity: Identity) => boolean;
  /** El token de esa identidad, o `null` si ya no es la vigente (antes o después de pedirlo). */
  tokenFor: (identity: Identity) => Promise<string | null>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Panel de cuentas (SDK 1.21): las guardadas en este navegador, cambiar, añadir y salir de todas. */
  savedAccounts: () => Promise<SavedAccount[]>;
  chooseAccount: (session: string) => Promise<void>;
  addAccount: () => Promise<boolean>;
  signOutAll: () => Promise<void>;
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
  const tracker = useRef(createIdentityTracker());

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // El SDK avisa antes de confirmar un cambio de identidad: lo empezado deja de valer al momento.
    const onIdentity = () => tracker.current.invalidate();
    window.addEventListener('yosiftware:identidad', onIdentity);
    void loadSdk().then(found => {
      if (cancelled) return;
      if (!found) {
        setSnapshot(fromState(null));
        return;
      }
      // El aspecto de Nodaria en las ventanas y paneles del SDK (ecosistema-kit/ESTILOS.md).
      void found.estilos?.({ css: platformStyles(window.location.origin) }).catch(() => undefined);
      // alCambiar llama al momento con el estado actual y después en cada cambio (también desde otras webs).
      stop = found.alCambiar(state => {
        const next = fromState(state);
        // Mientras se comprueba no hay cuenta confirmada: no se abre generación todavía.
        if (next.status !== 'loading') tracker.current.confirm(next.user?.id ?? null);
        setSnapshot(current =>
          // El mismo estado no vuelve a pintar ni reinicia la sincronización.
          JSON.stringify(next) === JSON.stringify(current) ? current : next,
        );
      });
    });
    return () => {
      cancelled = true;
      window.removeEventListener('yosiftware:identidad', onIdentity);
      stop?.();
    };
  }, []);

  const getToken = useCallback(async () => (await sdk()?.token()) ?? null, []);
  const identity = useCallback(() => tracker.current.current(), []);
  const isCurrent = useCallback((id: Identity) => tracker.current.isCurrent(id), []);
  const tokenFor = useCallback(async (id: Identity) => {
    if (!id.account || !tracker.current.isCurrent(id)) return null;
    const token = (await sdk()?.token()) ?? null;
    return tracker.current.isCurrent(id) ? token : null;
  }, []);
  const signIn = useCallback(async () => {
    await sdk()?.entrar();
  }, []);
  const signOut = useCallback(async () => {
    await sdk()?.salir();
  }, []);
  const savedAccounts = useCallback(async () => (await sdk()?.cuentasGuardadas?.())?.cuentas ?? [], []);
  const chooseAccount = useCallback(async (session: string) => {
    await sdk()?.elegirCuenta?.(session);
  }, []);
  const addAccount = useCallback(async () => (await sdk()?.anadirCuenta?.()) ?? false, []);
  const signOutAll = useCallback(async () => {
    const found = sdk();
    if (found?.salirDeTodas) await found.salirDeTodas();
    else await found?.salir();
  }, []);

  const value = useMemo(
    () => ({
      ...snapshot,
      getToken,
      identity,
      isCurrent,
      tokenFor,
      signIn,
      signOut,
      savedAccounts,
      chooseAccount,
      addAccount,
      signOutAll,
    }),
    [
      snapshot,
      getToken,
      identity,
      isCurrent,
      tokenFor,
      signIn,
      signOut,
      savedAccounts,
      chooseAccount,
      addAccount,
      signOutAll,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
