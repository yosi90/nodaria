import { useEffect, useState } from 'react';

const defaultMessage = (failure: unknown) =>
  failure instanceof Error && failure.message ? failure.message : 'No se ha podido cargar.';

/**
 * Carga algo al montar y cada vez que cambia `load`; `reload` lo vuelve a pedir. Lo que llega tarde, de una
 * carga anterior o de un componente ya desmontado, se descarta, y al cambiar `load` no se enseña lo de la
 * anterior (`value` vuelve a `null` hasta que llega lo nuevo). `describe` traduce el error para la persona.
 */
export function useLoad<T>(load: () => Promise<T>, describe: (failure: unknown) => string = defaultMessage) {
  const [state, setState] = useState<{ source: () => Promise<T>; value: T | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then(
      value => alive && setState({ source: load, value, error: null }),
      (failure: unknown) =>
        alive &&
        setState(current => ({
          source: load,
          value: current?.source === load ? current.value : null,
          error: describe(failure),
        })),
    );
    return () => {
      alive = false;
    };
    // `describe` no vuelve a cargar: es solo cómo se explica el error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, tick]);
  const current = state?.source === load ? state : null;
  return {
    value: current?.value ?? null,
    error: current?.error ?? null,
    /** Cambia lo cargado al momento (lo que se acaba de hacer), sin volver a pedirlo. */
    setValue: (value: T | null) => setState({ source: load, value, error: null }),
    reload: () => setTick(t => t + 1),
  };
}
