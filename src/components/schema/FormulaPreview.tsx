import { useState } from 'react';
import { formulaWarnings } from '../../domain/formulaDiagnostics';
import { nonNegativeWarning } from '../../domain/valueConstraints';
import { allFields, fieldValue, nodeLabel, relationLabel, typeMatches } from '../../domain/selectors';
import type { FieldDefinition } from '../../domain/types';
import { useApp } from '../../state/AppContext';

/** La muestra usa fichas reales; las advertencias usan el esquema, incluso sin fichas. */
export function FormulaPreview({ field, schemaId }: { field: FieldDefinition; schemaId?: string }) {
  const { project } = useApp();
  const [chosenType, setChosenType] = useState('');
  const [chosenItem, setChosenItem] = useState('');
  const types = schemaId
    ? project.schemas.filter(s => s.id === schemaId)
    : project.schemas.filter(s => allFields(project, s.id).some(f => f.id === field.id));
  const schema = types.find(s => s.id === chosenType) ?? types[0];
  if (!schema)
    return (
      <small className="muted-note">
        Vincula esta preforma a un tipo para validar la fórmula y ver una muestra de sus fichas.
      </small>
    );
  const fields = allFields(project, schema.id).map(f => (f.id === field.id ? field : f));
  const warnings = formulaWarnings(project, fields, field.formula, schema.kind);
  const nodes = schema.kind === 'entity' ? project.nodes.filter(n => typeMatches(project, n.typeId, [schema.id])) : [];
  const relations =
    schema.kind === 'relationship' ? project.relations.filter(r => typeMatches(project, r.typeId, [schema.id])) : [];
  const items = [...nodes, ...relations];
  const item = items.find(i => i.id === chosenItem) ?? items[0];
  const node = nodes.find(n => n.id === item?.id);
  const value = item ? fieldValue(field, item.values, fields, node ? { project, node } : undefined) : '';
  const resultWarning = nonNegativeWarning(field, value);
  return (
    <div className="formula-preview">
      {!schemaId && types.length > 1 && (
        <label className="field">
          Validar en el tipo
          <select value={schema.id} onChange={e => setChosenType(e.target.value)}>
            {types.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {items.length > 0 && (
        <label className="field">
          Ficha para la vista previa
          <select value={item?.id ?? ''} onChange={e => setChosenItem(e.target.value)}>
            {nodes.map(n => (
              <option key={n.id} value={n.id}>
                {nodeLabel(project, n)}
              </option>
            ))}
            {relations.map(r => (
              <option key={r.id} value={r.id}>
                {relationLabel(project, r)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div aria-live="polite">
        {warnings.map(w => (
          <p className="validation-message" key={w}>
            {w}
          </p>
        ))}
        {warnings.length > 0 && (
          <p className="muted-note">Recuerda usar los nombres o las claves de tus atributos en las fórmulas.</p>
        )}
        {resultWarning && <p className="validation-message">{resultWarning}</p>}
        <p className="formula-preview-result">
          <strong>Vista previa: </strong>
          {item ? String(value || 'Sin resultado') : 'No hay fichas de este tipo para mostrar una muestra.'}
        </p>
        {item && !value && !warnings.length && (
          <p className="muted-note">
            La fórmula no tiene avisos. Revisa que los atributos usados tengan valores y que las referencias apunten a
            una ficha.
          </p>
        )}
      </div>
    </div>
  );
}
