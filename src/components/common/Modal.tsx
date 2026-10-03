import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  submitLabel?: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function Modal({
  title,
  children,
  submitLabel = 'Guardar',
  submitDisabled = false,
  onSubmit,
  onClose,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={event => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={submitDisabled}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
