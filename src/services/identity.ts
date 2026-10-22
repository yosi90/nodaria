/*
 * Generaciones de identidad (`ecosistema-kit/CAMBIO_DE_CUENTA.md`). Cada vez que la cuenta puede haber
 * cambiado (el SDK avisa con `yosiftware:identidad` antes de confirmar, o llega otro id) empieza una
 * generación nueva. Lo que se empezó con una generación (una sincronización, una carga, un reintento)
 * comprueba antes de aplicar su resultado que sigue siendo la vigente; si no, lo descarta. Así una
 * respuesta tardía de A nunca se pinta ni se sube como B, aunque el paso sea A → B → A y el id vuelva a
 * coincidir: la generación es otra.
 */

export interface Identity {
  generation: number;
  /** Cuenta confirmada en esa generación, o `null` sin sesión (o mientras se confirma el cambio). */
  account: string | null;
}

/** La operación empezó con otra identidad: su resultado se descarta sin avisar. */
export class IdentityChangedError extends Error {
  constructor() {
    super('La cuenta ha cambiado: se descarta lo que se empezó con la anterior.');
    this.name = 'IdentityChangedError';
  }
}

export interface IdentityTracker {
  current(): Identity;
  /** El SDK avisa de que la identidad va a cambiar: lo empezado hasta ahora deja de valer. */
  invalidate(): void;
  /** La cuenta confirmada; si es otra que la anterior, empieza una generación nueva. */
  confirm(account: string | null): void;
  isCurrent(identity: Identity): boolean;
  /** Lanza `IdentityChangedError` si la identidad ya no es la vigente. */
  assertCurrent(identity: Identity): void;
}

export function createIdentityTracker(): IdentityTracker {
  let state: Identity = { generation: 0, account: null };
  /** Tras un aviso, la cuenta no vale hasta que se confirme (aunque vuelva a ser la misma). */
  let pending = false;
  return {
    current: () => (pending ? { generation: state.generation, account: null } : state),
    invalidate() {
      state = { generation: state.generation + 1, account: state.account };
      pending = true;
    },
    confirm(account) {
      if (!pending && account === state.account) return;
      state = { generation: pending ? state.generation : state.generation + 1, account };
      pending = false;
    },
    isCurrent: identity => !pending && identity.generation === state.generation && identity.account === state.account,
    assertCurrent(identity) {
      if (pending || identity.generation !== state.generation || identity.account !== state.account)
        throw new IdentityChangedError();
    },
  };
}
