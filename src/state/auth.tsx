/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  currentIdToken,
  hasPasswordProvider,
  needsEmailVerification,
  refreshVerificationStatus,
  signOutFirebase,
  subscribeToAuth,
  type FirebaseUser,
} from '../services/firebase';

/** Lo que la interfaz necesita saber de la sesión; el objeto de Firebase no sale de aquí. */
export interface AccountUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  /** Tiene contraseña (puede reautenticarse sin Google). */
  hasPassword: boolean;
}

/** `unverified`: cuenta de correo que aún no confirmó su dirección; la API la rechaza. */
export type AuthStatus = 'loading' | 'signed-out' | 'unverified' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  user: AccountUser | null;
  /** Token para la API, renovado por Firebase; `null` sin sesión. */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Vuelve a comprobar si el correo ya está verificado. */
  recheckVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Context = createContext<AuthContextValue | null>(null);

function toAccountUser(user: FirebaseUser): AccountUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    hasPassword: hasPasswordProvider(user),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);

  const apply = useCallback((current: FirebaseUser | null) => {
    setUser(current ? toAccountUser(current) : null);
    setStatus(!current ? 'signed-out' : needsEmailVerification(current) ? 'unverified' : 'signed-in');
  }, []);

  useEffect(() => subscribeToAuth(apply), [apply]);

  const getToken = useCallback((forceRefresh?: boolean) => currentIdToken(forceRefresh), []);
  const recheckVerification = useCallback(async () => {
    const verified = await refreshVerificationStatus();
    if (verified) setStatus('signed-in');
    return verified;
  }, []);
  const signOut = useCallback(() => signOutFirebase(), []);

  const value = useMemo(
    () => ({ status, user, getToken, recheckVerification, signOut }),
    [status, user, getToken, recheckVerification, signOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
