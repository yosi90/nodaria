/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API */
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppState } from '../../domain/types';
import { useApp } from '../../state/AppContext';

interface ToastOptions {
  message: string;
  /** Ofrece "Deshacer" mientras la acción siga siendo la última del historial. */
  undoable?: boolean;
  duration?: number;
}

interface Toast extends ToastOptions {
  id: number;
  /** Estado previo a la acción: deshacer solo la revierte si es el destino actual del historial. */
  before?: AppState;
}

const Context = createContext<((options: ToastOptions) => void) | null>(null);
const DEFAULT_DURATION = 6000;

/**
 * Avisos breves. Se deben emitir en el mismo manejador que hace el `dispatch`, de modo que
 * el estado capturado aquí sea el anterior a la acción.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { state, undo, undoTarget } = useApp();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts(current => current.filter(t => t.id !== id)), []);
  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts(current => [...current.slice(-2), { ...options, id, before: options.undoable ? state : undefined }]);
    },
    [state],
  );

  return (
    <Context.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            canUndo={Boolean(toast.before) && toast.before === undoTarget}
            onUndo={() => {
              undo();
              dismiss(toast.id);
            }}
            dismiss={dismiss}
          />
        ))}
      </div>
    </Context.Provider>
  );
}

function ToastItem({
  toast,
  canUndo,
  onUndo,
  dismiss,
}: {
  toast: Toast;
  canUndo: boolean;
  onUndo: () => void;
  dismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration ?? DEFAULT_DURATION);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id, toast.duration]);
  return (
    <div className="toast">
      <span>{toast.message}</span>
      {canUndo && (
        <button type="button" className="toast-action" onClick={onUndo}>
          Deshacer
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={() => dismiss(toast.id)}>
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function useToast() {
  const value = useContext(Context);
  if (!value) throw new Error('useToast debe usarse dentro de ToastProvider');
  return value;
}
