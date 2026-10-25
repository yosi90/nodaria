import { useEffect, useState, type ComponentType } from 'react';

/**
 * Monta `dialog` cuando alguien lanza `event` en `window` (los de `layout/openDialogs.ts`) y lo desmonta al
 * cerrarlo, para que cada apertura empiece de cero.
 */
export function DialogHost({
  event,
  dialog: Dialog,
}: {
  event: string;
  dialog: ComponentType<{ onClose: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(event, show);
    return () => window.removeEventListener(event, show);
  }, [event]);
  return open ? <Dialog onClose={() => setOpen(false)} /> : null;
}
