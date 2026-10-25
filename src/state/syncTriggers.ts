import { useEffect } from 'react';

/*
 * Cuándo se sincroniza, igual para los proyectos de la cuenta (`sync.tsx`) y los de los grupos
 * (`groups.tsx`). Lo que hace cada pasada, y cómo descarta lo de una cuenta anterior, es de cada uno.
 */

/** Retardo tras un cambio local antes de subirlo. */
export const PUSH_DELAY_MS = 2500;

/**
 * Repite `run` cada `every` milisegundos, al recuperar la conexión y al volver a la pestaña, mientras
 * `enabled`. Con `onlyVisible`, la repetición y la conexión recuperada solo cuentan con la pestaña visible.
 */
export function useRecurringSync(
  run: () => unknown,
  enabled: boolean,
  { every, onlyVisible = false }: { every: number; onlyVisible?: boolean },
) {
  useEffect(() => {
    if (!enabled) return;
    const visible = () => document.visibilityState === 'visible';
    const tick = () => {
      if (!onlyVisible || visible()) void run();
    };
    const onVisibility = () => {
      if (visible()) void run();
    };
    const interval = window.setInterval(tick, every);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [run, enabled, every, onlyVisible]);
}
