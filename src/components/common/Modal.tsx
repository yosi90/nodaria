import { X } from 'lucide-react';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps {
  title: string;
  children: ReactNode;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** `danger` pinta el botón principal en rojo para acciones destructivas. */
  tone?: 'default' | 'danger';
  /** Sin botón de envío: solo "Cerrar" (paneles informativos). */
  informational?: boolean;
  wide?: boolean;
  onSubmit?: () => void;
  onClose: () => void;
}

export function Modal({
  title,
  children,
  submitLabel = 'Guardar',
  submitDisabled = false,
  tone = 'default',
  informational,
  wide,
  onSubmit,
  onClose,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!submitDisabled) onSubmit?.();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-actions">
          {informational ? (
            <Button variant="primary" onClick={onClose}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant={tone === 'danger' ? 'solid-danger' : 'primary'} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
