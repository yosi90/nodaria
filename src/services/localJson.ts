/*
 * Recuerdos pequeños del navegador en `localStorage`, en JSON: lo sincronizado de la cuenta (`sync.ts`) y de
 * los grupos (`groups.ts`). Sin almacenamiento (o con un valor ilegible) se sigue sin ellos: se lee `null` y
 * lo escrito dura lo que la sesión.
 */

/** Lo guardado en `key`, o `null` si no hay, no se puede leer o no es JSON. */
export function readLocalJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Guarda `value` en `key`; `null` lo borra. */
export function writeLocalJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: el recuerdo dura lo que la sesión.
  }
}
