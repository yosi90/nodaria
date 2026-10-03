/* eslint-disable react-refresh/only-export-components -- provider y hooks forman una única API */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const Context = createContext<DialogContextValue | null>(null);

/** Sustituye a `confirm()` y `prompt()` nativos por modales de la aplicación basados en promesas. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ kind: 'confirm', options, resolve })),
    [],
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>(resolve => setPending({ kind: 'prompt', options, resolve })),
    [],
  );
  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <Context.Provider value={value}>
      {children}
      {pending?.kind === 'confirm' && (
        <Modal
          title={pending.options.title}
          submitLabel={pending.options.confirmLabel ?? 'Aceptar'}
          tone={pending.options.danger ? 'danger' : 'default'}
          onSubmit={() => {
            pending.resolve(true);
            setPending(null);
          }}
          onClose={() => {
            pending.resolve(false);
            setPending(null);
          }}
        >
          <div className="muted-note" style={{ color: 'var(--text)' }}>
            {pending.options.message}
          </div>
        </Modal>
      )}
      {pending?.kind === 'prompt' && (
        <PromptModal
          options={pending.options}
          onDone={result => {
            pending.resolve(result);
            setPending(null);
          }}
        />
      )}
    </Context.Provider>
  );
}

function PromptModal({ options, onDone }: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue ?? '');
  const input = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title={options.title}
      submitLabel={options.confirmLabel ?? 'Aceptar'}
      submitDisabled={!value.trim()}
      onSubmit={() => onDone(value.trim())}
      onClose={() => onDone(null)}
    >
      <label className="field">
        {options.label}
        <input
          ref={input}
          autoFocus
          value={value}
          placeholder={options.placeholder}
          onFocus={event => event.currentTarget.select()}
          onChange={event => setValue(event.target.value)}
        />
      </label>
    </Modal>
  );
}

export function useDialogs() {
  const value = useContext(Context);
  if (!value) throw new Error('useDialogs debe usarse dentro de DialogProvider');
  return value;
}
