/*
 * Texto para buscar, comparar y nombrar: sin acentos, sin mayúsculas o como clave. Lo usan el dominio
 * (menciones, fórmulas, importaciones, scripts de bases de datos) y los buscadores de la interfaz.
 */

const DIACRITICS = /[̀-ͯ]/g;

/** Sin acentos ni diéresis («Año» → Ano), con las mayúsculas y lo demás como estaban. */
export const stripAccents = (text: string) => text.normalize('NFD').replace(DIACRITICS, '');

/** Para buscar: en minúsculas y sin acentos («Árbol» → arbol). */
export const foldText = (text: string) => stripAccents(text.toLowerCase());

/** Para comparar nombres (títulos, atributos, funciones): además, sin espacios a los lados. */
export const normalizeName = (text: string) => foldText(text.trim());

/** Clave de un atributo a partir de su nombre: «Fecha de alta» → fecha_de_alta. */
export const slugify = (value: string) =>
  normalizeName(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
