import { useState } from 'react';
import { FIELD_TYPES } from '../../domain/constants';
import { sameKeyFields } from '../../domain/preformAdoption';
import type { FieldDefinition, Schema } from '../../domain/types';
import { conversionPreview } from '../../domain/valueConversion';
import { useApp } from '../../state/AppContext';
import { TypeIcon } from '../common/icons';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

const typeName = (f: FieldDefinition) => FIELD_TYPES.find(t => t[0] === f.type)?.[1] ?? f.type;

/**
 * Convertir en preforma un atributo que otros tipos repiten con la misma clave interna: pregunta cuáles de
 * esos pasan también a la preforma (todos marcados). Conservan su sitio en cada tipo (`preformAdoption.ts`).
 */
export function ShareFieldModal({
  schema,
  field,
  onClose,
}: {
  schema: Schema;
  field: FieldDefinition;
  onClose: () => void;
}) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const [candidates] = useState(() => sameKeyFields(project, schema.id, field.id));
  const [chosen, setChosen] = useState(() => new Set(candidates.map(c => c.field.id)));

  const toggle = (id: string, on: boolean) =>
    setChosen(current => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const submit = () => {
    const others = candidates.filter(c => chosen.has(c.field.id)).map(c => c.field.id);
    toast({
      message: others.length
        ? `«${field.label}» ahora es una preforma en ${others.length + 1} tipos`
        : `«${field.label}» ahora es una preforma`,
      undoable: true,
    });
    dispatch({ type: 'share-field', schemaId: schema.id, fieldId: field.id, others });
    onClose();
  };

  return (
    <Modal
      title={`Convertir «${field.label}» en preforma`}
      submitLabel={chosen.size ? `Convertir en ${chosen.size + 1} tipos` : 'Convertir solo aquí'}
      initialFocus="submit"
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <fieldset className="choice-group share-candidates">
          <legend>
            Otros tipos tienen un atributo con la clave interna «{field.key}». ¿Los conviertes también en esta preforma?
          </legend>
          {candidates.map(({ schema: owner, field: other }) => {
            const { lost } = conversionPreview(project, other, field);
            const notes = [
              other.label !== field.label && `pasará a llamarse «${field.label}»`,
              other.type !== field.type && `de ${typeName(other)} a ${typeName(field)}`,
              lost > 0 &&
                (lost === 1
                  ? 'se perderá 1 valor que no se puede convertir'
                  : `se perderán ${lost} valores que no se pueden convertir`),
            ].filter(Boolean);
            return (
              <label key={other.id}>
                <input
                  type="checkbox"
                  checked={chosen.has(other.id)}
                  onChange={event => toggle(other.id, event.target.checked)}
                />
                <TypeIcon icon={owner.icon} color={owner.color} size="sm" />
                <span>
                  <strong>{owner.name}</strong> · {other.label || other.key}
                  {notes.length > 0 && (
                    <small className={lost > 0 ? 'share-loss' : undefined}>{notes.join(' · ')}</small>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="muted-note">
          Cada uno conserva su sitio dentro de su tipo y sus valores. Puedes deshacerlo con Ctrl+Z.
        </p>
      </div>
    </Modal>
  );
}
