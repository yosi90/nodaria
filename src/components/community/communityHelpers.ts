import { useEffect, useRef, useState } from 'react';
import { publicPath, socialErrorMessage } from '../../services/community';
import { sdk, type YosiftwareSdk } from '../../services/yosiftware';

/* Ayudas de la sección «Comunidad» (docs/roadmaps/ROADMAP_COMUNIDAD.md): fechas, la página pública, las
 * denuncias de lo que es de la plataforma y la carga de datos. */

export const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

/** Abre la página pública en otra pestaña, para no dejar a medias lo que se está editando. */
export const openPublic = (publicId: string) => window.open(publicPath(publicId), '_blank', 'noopener');

/** Lo de la plataforma se denuncia con su ventana (`ecosistema-kit/MODERACION.md`). */
export const report = (options: Parameters<NonNullable<YosiftwareSdk['denunciar']>>[0]) =>
  void sdk()?.denunciar?.(options);

/** Carga algo al montar (y al cambiar `load`); `reload` lo vuelve a pedir. */
export function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then(
      result => {
        if (!alive) return;
        setValue(result);
        setError(null);
      },
      (failure: unknown) => alive && setError(socialErrorMessage(failure)),
    );
    return () => {
      alive = false;
    };
  }, [load, tick]);
  return { value, setValue, error, reload: () => setTick(t => t + 1) };
}

/** Llama a `onVisible` cuando el elemento entra en pantalla: para cargar más al llegar al final. */
export function useSentinel(onVisible: () => void, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element || !active || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => entries.some(e => e.isIntersecting) && callback.current(), {
      rootMargin: '400px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);
  return ref;
}
