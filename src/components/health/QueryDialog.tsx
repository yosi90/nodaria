import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { uid } from '../../domain/factories';
import { describeCondition, FIELD_OPS, runQuery, type QueryCondition, type SavedQuery } from '../../domain/queries';
import { allFields, nodeLabel } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { Modal } from '../common/Modal';
import { schemaOption } from '../common/options';
import { Select } from '../common/Select';

const KINDS: [QueryCondition['kind'], string][] = [
  ['field', 'Atributo'],
  ['relation', 'Relación'],
  ['parent', 'Nodo superior'],
  ['children', 'Subnodos'],
];

const blank = (kind: QueryCondition['kind'], firstFieldId: string): QueryCondition => {
  switch (kind) {
    case 'field':
      return { kind, fieldId: firstFieldId, op: 'empty', value: '' };
    case 'relation':
      return { kind, typeId: null, presence: 'lacks', end: 'any' };
    case 'parent':
    case 'children':
      return { kind, presence: 'lacks' };
  }
};

/** Constructor visual de una consulta: tipo, condiciones y vista previa de los resultados. */
export function QueryDialog({ initial, onClose }: { initial: SavedQuery | null; onClose: () => void }) {
  const { project, dispatch } = useApp();
  const entities = project.schemas.filter(s => s.kind === 'entity');
  const relations = project.schemas.filter(s => s.kind === 'relationship');
  const [query, setQuery] = useState<SavedQuery>(
    () =>
      initial ?? {
        id: uid('query'),
        name: '',
        typeId: entities.find(s => !s.isAbstract)?.id ?? entities[0]?.id ?? '',
        conditions: [],
      },
  );
  const fields = useMemo(() => (query.typeId ? allFields(project, query.typeId) : []), [project, query.typeId]);
  const results = useMemo(() => (query.typeId ? runQuery(project, query) : []), [project, query]);
  const set = (patch: Partial<SavedQuery>) => setQuery(q => ({ ...q, ...patch }));
  const setCondition = (index: number, c: QueryCondition) =>
    set({ conditions: query.conditions.map((x, i) => (i === index ? c : x)) });
  const [kindToAdd, setKindToAdd] = useState<QueryCondition['kind']>('field');

  const fieldOptions = fields.map(f => ({ value: f.id, label: f.label, hint: f.key }));
  const canSave = query.name.trim().length > 0 && query.typeId !== '';

  return (
    <Modal
      title={initial ? 'Editar consulta' : 'Nueva consulta'}
      submitLabel="Guardar consulta"
      submitDisabled={!canSave}
      wide
      onSubmit={() => {
        dispatch({ type: 'save-query', query: { ...query, name: query.name.trim() } });
        onClose();
      }}
      onClose={onClose}
    >
      <div className="form-grid">
        <label className="field">
          Nombre
          <input
            autoFocus
            value={query.name}
            placeholder="Personajes sin dios patrón"
            onChange={event => set({ name: event.target.value })}
          />
        </label>
        <div className="field">
          Nodos del tipo
          <Select
            options={entities.map(s => schemaOption(s))}
            value={query.typeId}
            onChange={typeId => set({ typeId: typeId ?? '', conditions: [] })}
          />
          <small>Los subtipos también cuentan.</small>
        </div>
        <div className="field">
          Condiciones (deben cumplirse todas)
          {query.conditions.length === 0 && <small>Sin condiciones: todos los nodos del tipo.</small>}
          <div className="query-conditions">
            {query.conditions.map((c, index) => (
              <div key={index} className="query-condition">
                {c.kind === 'field' && (
                  <>
                    <Select
                      compact
                      options={fieldOptions}
                      value={c.fieldId}
                      onChange={fieldId => setCondition(index, { ...c, fieldId: fieldId ?? c.fieldId })}
                    />
                    <select
                      value={c.op}
                      onChange={event => setCondition(index, { ...c, op: event.target.value as typeof c.op })}
                    >
                      {FIELD_OPS.map(([op, label]) => (
                        <option key={op} value={op}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {c.op !== 'empty' && c.op !== 'notEmpty' && (
                      <input
                        value={c.value}
                        placeholder="valor"
                        onChange={event => setCondition(index, { ...c, value: event.target.value })}
                      />
                    )}
                  </>
                )}
                {c.kind === 'relation' && (
                  <>
                    <select
                      value={c.presence}
                      onChange={event => setCondition(index, { ...c, presence: event.target.value as 'has' | 'lacks' })}
                    >
                      <option value="lacks">sin relación</option>
                      <option value="has">con relación</option>
                    </select>
                    <Select
                      compact
                      options={relations.map(s => schemaOption(s))}
                      value={c.typeId}
                      nullLabel="de cualquier tipo"
                      onChange={typeId => setCondition(index, { ...c, typeId })}
                    />
                    <select
                      value={c.end}
                      onChange={event => setCondition(index, { ...c, end: event.target.value as typeof c.end })}
                    >
                      <option value="any">en cualquier extremo</option>
                      <option value="source">como origen</option>
                      <option value="target">como destino</option>
                    </select>
                  </>
                )}
                {(c.kind === 'parent' || c.kind === 'children') && (
                  <select
                    value={c.presence}
                    onChange={event => setCondition(index, { ...c, presence: event.target.value as 'has' | 'lacks' })}
                  >
                    <option value="lacks">{c.kind === 'parent' ? 'sin nodo superior' : 'sin subnodos'}</option>
                    <option value="has">{c.kind === 'parent' ? 'con nodo superior' : 'con subnodos'}</option>
                  </select>
                )}
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label="Quitar condición"
                  onClick={() => set({ conditions: query.conditions.filter((_, i) => i !== index) })}
                />
              </div>
            ))}
          </div>
          <div className="query-add">
            <select value={kindToAdd} onChange={event => setKindToAdd(event.target.value as QueryCondition['kind'])}>
              {KINDS.map(([kind, label]) => (
                <option key={kind} value={kind} disabled={kind === 'field' && !fields.length}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              icon={Plus}
              disabled={kindToAdd === 'field' && !fields.length}
              onClick={() => set({ conditions: [...query.conditions, blank(kindToAdd, fields[0]?.id ?? '')] })}
            >
              Añadir condición
            </Button>
          </div>
        </div>
        <div className="field">
          Resultado: {results.length} nodo{results.length === 1 ? '' : 's'}
          {query.conditions.length > 0 && (
            <small>{query.conditions.map(c => describeCondition(project, query.typeId, c)).join(' · ')}</small>
          )}
          {results.length > 0 && (
            <p className="muted-note query-preview">
              {results
                .slice(0, 12)
                .map(n => nodeLabel(project, n))
                .join(', ')}
              {results.length > 12 ? ` y ${results.length - 12} más` : ''}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
