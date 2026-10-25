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

/** Un espacio de esta web con lo de la persona en él (`ecosistema-kit/ESPACIOS.md`). */
export interface PlatformSpace {
  id: number;
  idExterno: string;
  nombre: string;
  propietario: string;
  miembros: number;
  yo: {
    rol: string | null;
    propietario: boolean;
    estado: string;
    capacidades: { gestionar: boolean; invitar: boolean; chat: 'escribir' | 'leer' | 'nada' };
  } | null;
}

/** Lo que llega por el canal de un espacio (`ecosistema-kit/ESPACIOS.md`, «El canal de tiempo real»). */
export type SpaceChannelMessage =
  | { tipo: 'abierto' | 'presencia'; espacio: number; presentes: string[] }
  | { tipo: 'mensaje'; espacio: number; secuencia: number; idExterno: string; datos: Record<string, unknown> }
  | { tipo: 'desfase'; espacio: number }
  | { tipo: 'cerrado'; espacio: number; motivo: string }
  | { tipo: 'error'; espacio: number; code: string };

/** Una cuenta guardada en este navegador (SDK 1.21, `ecosistema-kit/ACCESO.md`, «El panel de cuentas»). */
export interface SavedAccount {
  /** Identificador de la sesión guardada: lo que se pasa a `elegirCuenta`. */
  sesion: string;
  cuenta: PlatformAccount;
  activa: boolean;
  nombre?: string | null;
  /** Miniatura del avatar (dirección completa) o `null`. */
  avatar?: string | null;
}

/**
 * Un proveedor en `GET /v1/ia/modelos` (`ecosistema-kit/CLAVES_DE_IA.md`, «Elegir el modelo»). `usos` y
 * `precio` llegan desde el kit 1.48; `precio: null` es que el modelo no está en la tabla de la plataforma.
 */
export interface PlatformModels {
  proveedores: {
    proveedor: string;
    modelos: { id: string; nombre: string; usos?: string[]; precio?: object | null }[];
    error: string | null;
  }[];
}

/**
 * `GET /v1/ia/estado` (`ecosistema-kit/CLAVES_DE_IA.md`, «Saber antes de llamar»): si cada proveedor está
 * `lista` y, desde el kit 1.54, el proveedor preferido de la persona para cada uso (`null`: sin elegir).
 */
export interface PlatformAiState {
  proveedores: { proveedor: string; estado: string }[];
  preferidos?: { texto?: string | null } | null;
}

/** Lo que lanza el SDK al cerrar su ventana de invitaciones (`yosiftware:espacio`). */
export type SpaceEvent =
  { tipo: 'aceptada'; espacio: PlatformSpace | null } | { tipo: 'rechazada'; invitacion: number };

export interface YosiftwareSdk {
  estado: PlatformState;
  listo(): Promise<PlatformState>;
  alCambiar(listener: (state: PlatformState) => void): () => void;
  entrar(options?: { vista?: 'entrar' | 'registro' }): Promise<boolean>;
  salir(): Promise<void>;
  /** Las cuentas guardadas en este navegador, para el panel de cuentas propio (SDK 1.21). */
  cuentasGuardadas?(): Promise<{ cuentas: SavedAccount[]; maximo: number } | null>;
  /** Cambia a otra cuenta guardada en todas las webs; si su sesión caducó, abre el acceso. */
  elegirCuenta?(sesion: string): Promise<unknown>;
  /** Abre el acceso para añadir otra cuenta sin cerrar las guardadas; `true` si se añadió. */
  anadirCuenta?(): Promise<boolean>;
  /** Cierra todas las cuentas guardadas en este navegador, en todas las webs. */
  salirDeTodas?(): Promise<void>;
  /** Token para la API de Nodaria (`aud: nodaria-api`); `null` sin sesión. */
  token(): Promise<string | null>;
  editarPerfil(): Promise<boolean>;
  perfil(): Promise<PlatformProfile | null>;
  reportar(options?: { tipo?: 'error' | 'propuesta' }): Promise<boolean>;
  privacidad(options?: { recorrido?: boolean }): Promise<void>;
  /**
   * Denuncia lo que es de la plataforma (una persona, una novedad, un comentario) con su ventana; `true` si
   * se envió. Con `persona`, al terminar propone bloquearla o dejar la amistad (`ecosistema-kit/MODERACION.md`).
   */
  denunciar?(options: {
    tipo: 'persona' | 'novedad' | 'comentario';
    referencia: string | number;
    nombre?: string;
    extracto?: string;
    persona?: string;
  }): Promise<boolean>;
  /**
   * La ventana flotante del chat (`<yosi-chat>`): `abrir()` abre el listado y `abrir(id)`, una conversación;
   * `false` si la página no tiene la ventana (`ecosistema-kit/CHAT.md`).
   */
  chat?: {
    abrir(conversacion?: number): boolean | Promise<boolean>;
  };
  /** Token para la API de la plataforma (espacios); `null` sin sesión. */
  tokenPlataforma?(): Promise<string | null>;
  /** Los espacios de la persona en Nodaria (SDK 1.17). Sin sesión, resuelven `null`. */
  espacios?: {
    mios(): Promise<PlatformSpace[] | null>;
    miembros(id: number): Promise<unknown[] | null>;
    invitar(id: number, a: { cuenta: string } | { correo: string }, rol?: string): Promise<unknown>;
    /**
     * El canal de tiempo real del espacio: lo que publica la API de Nodaria, en orden y sin perder nada al
     * reconectar, y quién lo tiene abierto.
     */
    canal?(
      id: number,
      oyente: (mensaje: SpaceChannelMessage) => void,
      opciones?: { desde?: number },
    ): { cerrar(): void };
    /** La ventana de la plataforma con las invitaciones pendientes en Nodaria. */
    verInvitaciones(opciones?: { codigo?: string }): Promise<void>;
  };
  /** Hoja de la web que el SDK aplica en sus elementos y manda a sus ventanas (SDK 1.14). */
  estilos?(sheet: string | { css: string } | null): Promise<void>;
}

declare global {
  interface Window {
    yosiftware?: YosiftwareSdk;
  }
  interface WindowEventMap {
    'yosiftware:espacio': CustomEvent<SpaceEvent>;
    /** La identidad va a cambiar (SDK 1.20, `CAMBIO_DE_CUENTA.md`): sin datos personales. */
    'yosiftware:identidad': Event;
  }
}

/** API de la plataforma del entorno, deducida de la dirección del SDK (`cuentas.` → `cuentas-api.`). */
export const PLATFORM_API_URL: string = (() => {
  try {
    const url = new URL(import.meta.env.VITE_YOSIFTWARE_SDK as string);
    return `${url.protocol}//${url.hostname.replace(/^((?:qa-)?cuentas)\./, '$1-api.')}`;
  } catch {
    return 'https://cuentas-api.yosiftware.es';
  }
})();

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
