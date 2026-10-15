import type { JWTPayload, JWTVerifyGetKey } from 'jose';

export declare const EMISORES: {
  produccion: 'https://cuentas-api.yosiftware.es';
  qa: 'https://qa-cuentas-api.yosiftware.es';
  desarrollo: 'http://localhost:5206';
};

/** El token no es de la plataforma, no es para esta API, le falta algo o está manipulado. */
export declare class TokenNoValido extends Error {}

/** El token ha caducado. La web pide otro a la plataforma y repite la petición. */
export declare class TokenCaducado extends TokenNoValido {}

/** Lo que trae un token válido de la plataforma. */
export interface DatosDelToken extends JWTPayload {
  /** Identificador de la cuenta en todo el ecosistema. */
  sub: string;
  /** Clave de la web que pidió el token. */
  azp: string;
  /** Sesión central de la que sale. */
  sid: string;
  /** Versión de las sesiones de la cuenta. */
  sv: number;
  /** Alias en el momento de emitirlo: solo para mostrar. */
  alias?: string;
}

export interface OpcionesDelVerificador {
  /** Audiencia de la API de tu web en el registro, como «lorcana-api». */
  audiencia: string;
  /** Entorno de la plataforma; o bien `emisor`. */
  entorno?: keyof typeof EMISORES;
  emisor?: string;
  /** Solo para pruebas: claves en lugar de las del JWKS de la plataforma. */
  claves?: JWTVerifyGetKey;
}

export declare function crearVerificador(opciones: OpcionesDelVerificador): (token: string) => Promise<DatosDelToken>;
