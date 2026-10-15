/*
 * SDK de la plataforma Yosiftware (`ecosistema-kit/ACCESO.md`). Lo carga `index.html` desde la
 * plataforma del entorno (`VITE_YOSIFTWARE_SDK`), nunca empaquetado con la web, y deja la API en
 * `window.yosiftware`. Aquí solo se tipa la parte que usa Nodaria y se espera a que esté lista; los
 * tokens nunca se guardan: se piden al SDK cada vez.
 */

export interface PlatformAccount {
  /** Identificador estable de la persona en todo el ecosistema (el `sub` de los tokens). */
  id: string;
  alias: string;
  correo?: string | null;
  propietario?: boolean;
  estado?: string;
}

export type PlatformState =
  | { tipo: 'comprobando' | 'sin_sesion' | 'no_disponible'; motivo?: string }
  | {
      tipo: 'con_sesion';
      cuenta: PlatformAccount;
      restricciones?: { alcances: string[]; hasta: string | null };
      normasPendientes?: boolean;
    };

export interface PlatformProfile {
  alias: string;
  nombre?: string | null;
  avatar?: { url: string; miniatura: string; version: number } | null;
}

export interface YosiftwareSdk {
  estado: PlatformState;
  listo(): Promise<PlatformState>;
  alCambiar(listener: (state: PlatformState) => void): () => void;
  entrar(options?: { vista?: 'entrar' | 'registro' }): Promise<boolean>;
  salir(): Promise<void>;
  /** Token para la API de Nodaria (`aud: nodaria-api`); `null` sin sesión. */
  token(): Promise<string | null>;
  editarPerfil(): Promise<boolean>;
  perfil(): Promise<PlatformProfile | null>;
  reportar(options?: { tipo?: 'error' | 'propuesta' }): Promise<boolean>;
  privacidad(options?: { recorrido?: boolean }): Promise<void>;
  /** Hoja de la web que el SDK aplica en sus elementos y manda a sus ventanas (SDK 1.14). */
  estilos?(sheet: string | { css: string } | null): Promise<void>;
}

declare global {
  interface Window {
    yosiftware?: YosiftwareSdk;
  }
}

/** Web social de la plataforma: la cuenta, la privacidad y los datos de la persona. */
export const SOCIAL_URL = 'https://social.yosiftware.es';

let pending: Promise<YosiftwareSdk | null> | null = null;

/**
 * El SDK, cuando termine de cargar; `null` si no llega (sin conexión con la plataforma, o en local
 * sin su script): Nodaria sigue funcionando sin cuenta.
 */
export function loadSdk(timeoutMs = 20_000): Promise<YosiftwareSdk | null> {
  pending ??= new Promise(resolve => {
    const started = Date.now();
    const check = () => {
      if (window.yosiftware) resolve(window.yosiftware);
      else if (Date.now() - started > timeoutMs) resolve(null);
      else window.setTimeout(check, 100);
    };
    check();
  });
  return pending;
}

/** El SDK ya cargado, o `null` (para acciones que el usuario pide después de cargar la página). */
export const sdk = (): YosiftwareSdk | null => window.yosiftware ?? null;
