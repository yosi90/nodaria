/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/*
 * Recorrido guiado: una lista de pasos que señalan partes de la interfaz. Aquí solo vive el estado
 * (paso activo); los pasos y su dibujo están en `src/components/onboarding/Tour.tsx`.
 */

interface TourContextValue {
  /** Índice del paso activo, o `null` si no hay recorrido en marcha. */
  step: number | null;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  /** Cuántos pasos tiene el recorrido (lo fija el componente que lo dibuja). */
  total: number;
  setTotal: (n: number) => void;
}

const Context = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const start = useCallback(() => setStep(0), []);
  const stop = useCallback(() => setStep(null), []);
  const next = useCallback(() => setStep(s => (s === null ? null : s + 1 >= total ? null : s + 1)), [total]);
  const prev = useCallback(() => setStep(s => (s === null || s === 0 ? s : s - 1)), []);
  const value = useMemo(
    () => ({ step, start, stop, next, prev, total, setTotal }),
    [step, start, stop, next, prev, total],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTour() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useTour fuera de TourProvider');
  return ctx;
}
