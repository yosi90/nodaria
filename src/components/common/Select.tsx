import { ChevronsUpDown, Plus, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { OptionList, type Option } from './OptionList';
import { Popover } from './Popover';
import { anchorOf, type Anchor } from './anchor';

interface SelectProps {
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Si se indica, aparece como primera opción y representa `null`. */
  nullLabel?: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/** Selector con búsqueda que sustituye al `<select>` nativo cuando las opciones son muchas o ricas. */
export function Select({
  options,
  value,
  onChange,
  nullLabel,
  placeholder = 'Elegir…',
  compact,
  disabled,
  id,
  ...aria
}: SelectProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setAnchor(null), []);
  const allOptions = nullLabel ? [{ value: '', label: nullLabel }, ...options] : options;
  const current = allOptions.find(o => o.value === (value ?? ''));

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`select-trigger ${compact ? 'compact' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchor)}
        aria-label={aria['aria-label']}
        disabled={disabled}
        onClick={event => (anchor ? close() : setAnchor(anchorOf(event.currentTarget)))}
      >
        {current?.leading}
        <span className={`label ${current ? '' : 'placeholder'}`}>{current?.label ?? placeholder}</span>
        <ChevronsUpDown size={14} aria-hidden />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={close} matchWidth>
          <OptionList
            options={allOptions}
            selected={[value ?? '']}
            onPick={picked => {
              onChange(picked === '' && nullLabel ? null : picked);
              close();
              // El popover se desmonta antes de poder devolver el foco: se devuelve aquí.
              trigger.current?.focus();
            }}
          />
        </Popover>
      )}
    </>
  );
}

interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  addLabel?: string;
  emptyText?: string;
  disabled?: boolean;
}

/** Lista de chips con un botón para añadir más; sustituye a `<select multiple>`. */
export function MultiSelect({ options, value, onChange, addLabel = 'Añadir', emptyText, disabled }: MultiSelectProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const chosen = value.map(v => options.find(o => o.value === v)).filter((o): o is Option => Boolean(o));
  const toggle = (picked: string) =>
    onChange(value.includes(picked) ? value.filter(v => v !== picked) : [...value, picked]);

  return (
    <div className="chip-list">
      {chosen.map(option => (
        <span className="chip" key={option.value}>
          {option.leading}
          <span>{option.label}</span>
          {!disabled && (
            <button type="button" aria-label={`Quitar ${option.label}`} onClick={() => toggle(option.value)}>
              <X size={12} aria-hidden />
            </button>
          )}
        </span>
      ))}
      {!chosen.length && emptyText && <span className="field-hint">{emptyText}</span>}
      {!disabled && (
        <button
          type="button"
          className="btn ghost sm"
          aria-haspopup="listbox"
          aria-expanded={Boolean(anchor)}
          onClick={event => (anchor ? close() : setAnchor(anchorOf(event.currentTarget)))}
        >
          <Plus size={14} aria-hidden />
          {addLabel}
        </button>
      )}
      {anchor && (
        <Popover anchor={anchor} onClose={close}>
          <OptionList options={options} selected={value} onPick={toggle} multiple />
        </Popover>
      )}
    </div>
  );
}
