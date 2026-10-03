import { Plus } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../../domain/factories';
import { referenceCandidates } from '../../domain/references';
import { allFields, getSchema } from '../../domain/selectors';
import type { FieldDefinition, FieldValue } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Modal } from '../common/Modal';
import { nodeOption, schemaOption } from '../common/options';
import { MultiSelect, Select } from '../common/Select';

const NEW = '__new__';

interface ReferenceControlProps {
  field: FieldDefinition;
  value: FieldValue | undefined;
  /** Nodo que posee el atributo: se excluye de los candidatos. */
  ownerId: string;
  onChange: (value: FieldValue) => void;
}

/** Editor de atributos de referencia: selector con buscador limitado a los tipos permitidos, con «crear nuevo». */
export function ReferenceControl({ field, value, ownerId, onChange }: ReferenceControlProps) {
  const { project, dispatch } = useApp();
  const [creating, setCreating] = useState(false);
  const candidates = referenceCandidates(project, field, ownerId);
  const options = [...candidates.map(n => nodeOption(project, n)), { value: NEW, label: 'Crear nuevo…', hint: '＋' }];
  const allowedTypes = project.schemas.filter(
    s => s.kind === 'entity' && !s.isAbstract && (!field.referenceTypeIds.length || inherits(s.id)),
  );

  function inherits(typeId: string) {
    const chain: string[] = [];
    let cur = getSchema(project, typeId);
    while (cur && !chain.includes(cur.id)) {
      chain.push(cur.id);
      cur = cur.parentTypeId ? getSchema(project, cur.parentTypeId) : undefined;
    }
    return chain.some(id => field.referenceTypeIds.includes(id));
  }

  const createAndPick = (typeId: string, name: string) => {
    const id = uid('node');
    dispatch({ type: 'add-node', typeId, parentId: null, id });
    const title =
      allFields(project, typeId).find(f => f.isTitle) ?? allFields(project, typeId).find(f => f.type === 'text');
    if (title) dispatch({ type: 'update-node', id, values: { [title.id]: name }, parentId: null });
    onChange(field.type === 'nodeRefs' ? [...(Array.isArray(value) ? value : []), id] : id);
    setCreating(false);
  };

  return (
    <>
      {field.type === 'nodeRefs' ? (
        <MultiSelect
          options={options}
          value={Array.isArray(value) ? value : []}
          addLabel="Añadir"
          emptyText="Ninguno."
          onChange={ids => (ids.includes(NEW) ? setCreating(true) : onChange(ids))}
        />
      ) : (
        <Select
          aria-label={field.label}
          options={options}
          value={typeof value === 'string' ? value : null}
          nullLabel="Sin elegir"
          onChange={id => (id === NEW ? setCreating(true) : onChange(id))}
        />
      )}
      {creating && (
        <NewNodeModal
          types={allowedTypes}
          title={`Nuevo valor para «${field.label}»`}
          onCreate={createAndPick}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/** Crea un nodo con nombre eligiendo entre los tipos ofrecidos. */
export function NewNodeModal({
  types,
  title,
  onCreate,
  onClose,
}: {
  types: { id: string; name: string; icon: string; color: string }[];
  title: string;
  onCreate: (typeId: string, name: string) => void;
  onClose: () => void;
}) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [name, setName] = useState('');
  return (
    <Modal
      title={title}
      submitLabel="Crear"
      submitDisabled={!typeId || !name.trim()}
      onSubmit={() => onCreate(typeId, name.trim())}
      onClose={onClose}
    >
      <div className="form-grid">
        {types.length > 1 && (
          <div className="field">
            Tipo
            <Select
              aria-label="Tipo del nuevo nodo"
              options={types.map(t => schemaOption({ ...t } as never))}
              value={typeId}
              onChange={id => setTypeId(id ?? '')}
            />
          </div>
        )}
        {!types.length && <p className="validation-message">Ningún tipo de entidad admite este atributo.</p>}
        <label className="field">
          Nombre
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del nuevo nodo" />
        </label>
      </div>
      <Plus size={0} aria-hidden />
    </Modal>
  );
}
