import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

/**
 * Configuración pública de la app web «Nodaria Web» (viaja en cada cliente; no es un secreto).
 * En producción el dominio de autenticación es el propio: Firebase Hosting sirve `/__/auth/handler`
 * en `nodaria.yosiftware.es`, lo que evita depender de cookies de terceros en la ventana de Google.
 */
const firebaseConfig = {
  apiKey: 'REDACTED_FIREBASE_WEB_API_KEY',
  authDomain: import.meta.env.DEV ? 'yosiftware-nodaria.firebaseapp.com' : 'nodaria.yosiftware.es',
  projectId: 'yosiftware-nodaria',
  storageBucket: 'yosiftware-nodaria.firebasestorage.app',
  messagingSenderId: '485119322480',
  appId: '1:485119322480:web:d70fd1bf48e1fc648587b5',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
// Correos de verificación y recuperación en español.
auth.languageCode = 'es';

export type { User as FirebaseUser };

export function hasPasswordProvider(user: User) {
  return user.providerData.some(provider => provider.providerId === 'password');
}

/** Las cuentas de correo y contraseña deben verificar su dirección; las de Google llegan verificadas. */
export function needsEmailVerification(user: User) {
  return hasPasswordProvider(user) && !user.emailVerified;
}

export const subscribeToAuth = (listener: (user: User | null) => void) => onAuthStateChanged(auth, listener);

export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerWithEmail(email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(user);
}

export async function resendVerificationEmail() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

/** Recarga el usuario y renueva el token para que `email_verified` llegue a la API. */
export async function refreshVerificationStatus() {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

/** Reautentica con la contraseña (cuentas de correo) o con la ventana de Google. */
export async function reauthenticate(password?: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión iniciada.');
  if (hasPasswordProvider(user) && user.email && password !== undefined) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  }
}

export async function signOutFirebase() {
  await signOut(auth);
}

/** Token de la sesión actual para la API, o `null` sin sesión. */
export async function currentIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  return user ? user.getIdToken(forceRefresh) : null;
}

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/missing-password': 'Escribe la contraseña.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a probar.',
  'auth/network-request-failed': 'Sin conexión. Comprueba tu red.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de terminar.',
  'auth/cancelled-popup-request': 'Se cerró la ventana de Google antes de terminar.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google.',
  'auth/user-disabled': 'La cuenta está desactivada.',
  'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión.',
  'auth/user-mismatch': 'Esa cuenta no es la que tiene la sesión iniciada.',
  'auth/operation-not-allowed': 'Este método de acceso no está activado.',
};

export function getAuthErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return error instanceof Error ? error.message : 'Error inesperado.';
}
