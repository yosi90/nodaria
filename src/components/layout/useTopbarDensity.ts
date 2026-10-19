import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Cuánto se compacta la barra superior (0 = todo a la vista, `max` = lo más recogido). Sube un nivel
 * mientras el contenido no cabe y baja cuando cabría el anterior, cuya anchura se recuerda de cuando
 * estuvo puesto. `overflowing` indica que ni el nivel máximo cabe: solo entonces la barra se desplaza.
 *
 * La anchura necesaria es la de la barra sin el `.spacer`, que absorbe el hueco libre. Se mide desde el
 * `ResizeObserver` de la barra y de sus hijos, que también avisa al cambiar el nombre del proyecto o el
 * contenido de un botón; `contentKey` olvida las anchuras recordadas cuando cambia lo que hay en la barra.
 */
export function useTopbarDensity<T extends HTMLElement>(max: number, contentKey: string) {
  const ref = useRef<T>(null);
  const [density, setDensity] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const widths = useRef<number[]>([]);
  const measuredKey = useRef(contentKey);

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const measure = () => {
      if (measuredKey.current !== contentKey) {
        measuredKey.current = contentKey;
        widths.current = [];
        if (density > 0) return setDensity(0);
      }
      const spacer = bar.querySelector<HTMLElement>(':scope > .spacer');
      const needed = bar.scrollWidth - (spacer?.offsetWidth ?? 0);
      const available = bar.clientWidth;
      widths.current[density] = needed;
      const fits = needed <= available + 1;
      if (!fits && density < max) setDensity(density + 1);
      else if (density > 0 && (widths.current[density - 1] ?? Infinity) <= available) setDensity(density - 1);
      setOverflowing(!fits && density === max);
    };
    // Al observar, el ResizeObserver llama una primera vez: así se mide también tras cada cambio de nivel.
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    for (const child of Array.from(bar.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [contentKey, density, max]);

  return { ref, density, overflowing };
}
