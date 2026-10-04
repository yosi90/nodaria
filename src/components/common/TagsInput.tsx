import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/** Etiquetas libres: chips que se añaden con Intro o coma y se quitan con su botón o con retroceso. */
export function TagsInput({
  value,
  onChange,
  placeholder = 'Escribe y pulsa Intro',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="tags-input">
      {value.map(tag => (
        <span className="chip" key={tag}>
          <span>{tag}</span>
          <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(value.filter(t => t !== tag))}>
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
