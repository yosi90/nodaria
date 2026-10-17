import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

/**
 * Lista ordenada: elementos de texto numerados que se editan en su sitio, se mueven arriba o abajo y se
 * quitan. Uno nuevo se añade con Intro al final. A diferencia de las etiquetas, admite repetidos.
 */
export function ListInput({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (items: string[]) => void;
  label: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const item = draft.trim();
    if (item) onChange([...value, item]);
    setDraft('');
  };
  const edit = (index: number, text: string) => {
    const item = text.trim();
    if (item === value[index]) return;
    onChange(item ? value.map((x, i) => (i === index ? item : x)) : value.filter((_, i) => i !== index));
  };
  const move = (index: number, delta: number) => {
    const next = [...value];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };
  return (
    <ol className="list-input" aria-label={label}>
      {value.map((item, index) => (
        // La clave incluye el texto: al moverlo o cambiarlo desde fuera, el campo se rehace con su valor.
        <li key={`${index}:${item}`}>
          <span className="list-number" aria-hidden>
            {index + 1}.
          </span>
          <input
            defaultValue={item}
            aria-label={`Elemento ${index + 1}`}
            onBlur={e => edit(index, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            aria-label={`Subir el elemento ${index + 1}`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            <ArrowUp size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Bajar el elemento ${index + 1}`}
            disabled={index === value.length - 1}
            onClick={() => move(index, 1)}
          >
            <ArrowDown size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Quitar el elemento ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X size={13} aria-hidden />
          </button>
        </li>
      ))}
      <li className="list-new">
        <span className="list-number" aria-hidden>
          {value.length + 1}.
        </span>
        <input
          value={draft}
          placeholder="Escribe y pulsa Intro"
          aria-label="Elemento nuevo"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
        />
      </li>
    </ol>
  );
}
