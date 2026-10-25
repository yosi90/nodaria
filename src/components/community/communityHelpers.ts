import { useEffect, useRef, useState } from 'react';
import { publicPath, relationship, socialErrorMessage, type Relationship } from '../../services/community';
import { sdk, type YosiftwareSdk } from '../../services/yosiftware';
import { useToast } from '../common/toasts';

/* Ayudas de la sección «Comunidad» (docs/roadmaps/ROADMAP_COMUNIDAD.md): la página pública, copiar sus
 * enlaces, las denuncias de lo que es de la plataforma y la carga de datos. */

/** Abre la página pública en otra pestaña, para no dejar a medias lo que se está editando. */
export const openPublic = (publicId: string) => window.open(publicPath(publicId), '_blank', 'noopener');

/** Copia un enlace y lo confirma con un aviso; si el navegador no deja copiar, el aviso enseña el enlace. */
export function useCopyLink() {
  const toast = useToast();
  return async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: 'Enlace copiado' });
    } catch {
      toast({ message: url });
    }
  };
}

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

/**
 * La relación de la cuenta con una persona (seguir, amistad, bloqueo): `undefined` mientras se pide y `null`
 * si no se ha podido. El setter deja reflejar al momento lo que se acaba de cambiar.
 */
export function useRelationship(personId: string) {
  const [relation, setRelation] = useState<Relationship | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    relationship(personId).then(
      found => alive && setRelation(found),
      () => alive && setRelation(null),
    );
    return () => {
      alive = false;
    };
  }, [personId]);
  return [relation, setRelation] as const;
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

/**
 * Abre la ventana de chats en una conversación (o en el listado). `false` si la página no la tiene (la
 * persona la apagó) o el SDK aún no ha cargado: entonces quien llama abre la pestaña «Chats».
 */
export async function openFloatingChat(conversation?: number): Promise<boolean> {
  const chat = sdk()?.chat;
  if (!chat || !document.querySelector('yosi-chat')) return false;
  try {
    return Boolean(await chat.abrir(conversation));
  } catch {
    return false;
  }
}
