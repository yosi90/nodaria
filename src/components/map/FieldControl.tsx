import type { ChangeEvent } from 'react';
import { GENDERS } from '../../domain/constants';
import type { FieldDefinition, FieldValue } from '../../domain/types';
import { ExternalLink, Star } from 'lucide-react';
import { TagsInput } from '../common/TagsInput';
import { ImageControl } from './ImageControl';
import { imageClasses } from '../../domain/portrait';
import { ReferenceControl } from './ReferenceControl';

/** Control de edición de un atributo según su tipo. Lo usan la ficha y la tabla. */
export function FieldControl({
  field,
  value,
  ownerId,
  onChange,
  titleField,
  autoFocus,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  ownerId: string;
  onChange: (v: FieldValue) => void;
  titleField?: boolean;
  autoFocus?: boolean;
}) {
  const common = {
    'data-title-field': titleField ? 'true' : undefined,
    autoFocus,
    value: String(value ?? ''),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value),
  };
  if (field.type === 'nodeRef' || field.type === 'nodeRefs')
    return <ReferenceControl field={field} value={value} ownerId={ownerId} onChange={onChange} />;
  if (field.type === 'image')
    return (
      <ImageControl
        value={value}
        label={field.label}
        className={imageClasses({ shape: field.imageShape, border: field.imageBorder })}
        onChange={onChange}
      />
    );
  if (field.type === 'gender')
    return (
      <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
        {GENDERS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  if (field.type === 'boolean')
    return (
      <label className="check">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
        {value ? 'Sí' : 'No'}
      </label>
    );
  if (field.type === 'tags')
    return <TagsInput value={Array.isArray(value) ? value : []} onChange={tags => onChange(tags)} />;
  if (field.type === 'scale') {
    const current = typeof value === 'number' ? value : 0;
    return (
      <div className="scale-field" role="radiogroup" aria-label={field.label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            className={n <= current ? 'on' : ''}
            title={String(n)}
            onClick={() => onChange(current === n ? null : n)}
          >
            <Star size={16} aria-hidden fill={n <= current ? 'currentColor' : 'none'} />
          </button>
        ))}
        <span className="scale-value">{current ? `${current} / 5` : '—'}</span>
      </div>
    );
  }
  if (field.type === 'color')
    return (
      <div className="color-field">
        <input
          type="color"
          aria-label={`${field.label} (selector)`}
          value={/^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : '#888888'}
          onChange={e => onChange(e.target.value)}
        />
        <input {...common} placeholder="#rrggbb" />
      </div>
    );
  if (field.type === 'url')
    return (
      <div className="url-field">
        <input {...common} type="url" placeholder="https://…" />
        {typeof value === 'string' && /^https?:\/\//i.test(value) && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="icon-btn"
            aria-label="Abrir enlace"
            title="Abrir enlace"
          >
            <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </div>
    );
  if (field.type === 'longText') return <textarea {...common} />;
  if (field.type === 'select')
    return (
      <select {...common}>
        <option value="">Sin elegir</option>
        {field.options.map(x => (
          <option key={x}>{x}</option>
        ))}
      </select>
    );
  if (field.type === 'computed') return <input disabled value={String(value ?? '')} />;
  return <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} {...common} />;
}
