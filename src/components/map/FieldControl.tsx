import type { ChangeEvent } from 'react';
import { GENDERS } from '../../domain/constants';
import type { FieldDefinition, FieldValue } from '../../domain/types';
import { ImageControl } from './ImageControl';
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
  if (field.type === 'image') return <ImageControl value={value} label={field.label} onChange={onChange} />;
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
