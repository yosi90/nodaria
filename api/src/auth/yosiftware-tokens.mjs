/**
 * Validación de los tokens de la plataforma Yosiftware en la API de una web (Node 20 o posterior).
 *
 * Copia este archivo (y su `.d.mts` si usas TypeScript) en tu proyecto. Necesita `jose`: `npm install jose`.
 *
 *     const verificar = crearVerificador({ entorno: "produccion", audiencia: "lorcana-api" });
 *
 *     try {
 *       const datos = await verificar(token); // el valor de `Authorization: Bearer <token>`
 *       const idGlobal = datos.sub; // identificador de la cuenta en todo el ecosistema
 *     } catch (error) {
 *       // TokenCaducado o TokenNoValido: responde 401; la web pedirá un token nuevo y repetirá
 *     }
 *
 * Reglas que aplica (ver `VALIDAR_TOKENS.md`): solo ES256; claves del JWKS de la plataforma, guardadas 5 minutos
 * y recargadas como mucho una vez por minuto cuando llega una clave desconocida; emisor exacto del entorno,
 * audiencia de tu API y caducidad con 5 segundos de margen.
 */

import { createRemoteJWKSet, errors, jwtVerify } from "jose";

export const EMISORES = {
  produccion: "https://cuentas-api.yosiftware.es",
  qa: "https://qa-cuentas-api.yosiftware.es",
  desarrollo: "http://localhost:5206",
};

/** El token no es de la plataforma, no es para esta API, le falta algo o está manipulado. */
export class TokenNoValido extends Error {
  constructor(mensaje, opciones) {
    super(mensaje, opciones);
    this.name = "TokenNoValido";
  }
}

/** El token ha caducado. La web pide otro a la plataforma y repite la petición. */
export class TokenCaducado extends TokenNoValido {
  constructor(mensaje, opciones) {
    super(mensaje, opciones);
    this.name = "TokenCaducado";
  }
}

/**
 * Crea la función que valida tokens para una API. Créala una vez y compártela entre peticiones.
 * `claves` solo hace falta en pruebas (por ejemplo, con `createLocalJWKSet`).
 */
export function crearVerificador({ audiencia, entorno, emisor, claves } = {}) {
  if (!audiencia) {
    throw new TypeError("Indica la audiencia de tu API, como «lorcana-api».");
  }
  if ((entorno === undefined) === (emisor === undefined)) {
    throw new TypeError("Indica el entorno o el emisor, uno de los dos.");
  }
  const elEmisor = emisor ?? EMISORES[entorno];
  if (!elEmisor) {
    throw new TypeError(`Entorno desconocido: ${entorno}`);
  }
  const jwks =
    claves ??
    createRemoteJWKSet(new URL(`${elEmisor}/.well-known/jwks.json`), {
      cacheMaxAge: 300_000,
      cooldownDuration: 60_000,
    });

  return async function verificar(token) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: elEmisor,
        audience: audiencia,
        algorithms: ["ES256"],
        clockTolerance: 5,
        requiredClaims: ["sub", "sid", "azp", "iat", "exp"],
      });
      return payload;
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new TokenCaducado("El token ha caducado.", { cause: error });
      }
      throw new TokenNoValido(`Token no válido (${error?.code ?? "desconocido"}).`, { cause: error });
    }
  };
}
