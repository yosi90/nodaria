import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nodeConnections } from '../../domain/connections';
import { derivedKinship, kinshipName, kinshipTerm, nodeGender } from '../../domain/kinship';
import { uid } from '../../domain/factories';
import { allFields, getNode, getSchema, nodeLabel, relationRole, typeMatches } from '../../domain/selectors';
import type { FieldValue, Relation, Schema } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { Button, IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { nodeOption, schemaOption } from '../common/options';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';
import { KinshipFields } from './KinshipFields';

/**
 * Relaciones de un nodo dentro de su ficha: lista editable y un editor desplegable para crear
 * o modificar sin salir del panel.
 */
export function RelationsSection({ nodeId }: { nodeId: string }) {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const connections = nodeConnections(project, nodeId);
  const relationTypes = project.schemas.filter(s => s.kind === 'relationship');
  if (!connections) return null;

  const remove = (relation: Relation) => {
    toast({ message: `Relación «${relationRole(project, relation, 'source')}» eliminada`, undoable: true });
    dispatch({ type: 'delete-relation', id: relation.id });
    if (editing === relation.id) setEditing(null);
  };

  return (
    <section className="inspector-section relations-section">
      <div className="section-head">
        <h3>Relaciones</h3>
        <div className="spacer" />
        <Button
          size="sm"
          icon={Plus}
          disabled={!relationTypes.length}
          title={relationTypes.length ? undefined : 'Crea primero un tipo de relación en «Relaciones»'}
          onClick={() => {
            setCreating(v => !v);
            setEditing(null);
          }}
        >
          Nueva
        </Button>
      </div>
      {creating && (
        <RelationForm
          nodeId={nodeId}
          onDone={id => {
            setCreating(false);
            if (id) setEditing(null);
          }}
        />
      )}
      {connections.relations.length ? (
        <div className="relation-list">
          {connections.relations.map(({ relation, schema, other, direction }) => {
            const mine = relationRole(project, relation, direction === 'out' ? 'source' : 'target');
            const theirs = relationRole(project, relation, direction === 'out' ? 'target' : 'source');
            const open = editing === relation.id;
            return (
              <div key={relation.id} className={`relation-item ${open ? 'open' : ''}`}>
                <div className="relation-row">
                  <button
                    type="button"
                    className="relation-toggle"
                    aria-expanded={open}
                    onClick={() => {
                      setEditing(open ? null : relation.id);
                      setCreating(false);
                    }}
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />
                    <span className="relation-text">
                      <strong>{theirs}</strong>
                      <span className="muted"> · </span>
                      <span
                        className="relation-other"
                        role="link"
                        tabIndex={0}
                        onClick={e => {
                          e.stopPropagation();
                          select({ kind: 'node', id: other.id }, { reveal: true });
                        }}
                        onKeyDown={e => e.key === 'Enter' && select({ kind: 'node', id: other.id }, { reveal: true })}
                      >
                        {nodeLabel(project, other)}
                      </span>
                      {mine !== theirs && <small className="muted"> (yo: {mine})</small>}
                    </span>
                    <span className="badge">{schema?.name}</span>
                  </button>
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    variant="danger"
                    label="Eliminar relación"
                    tooltipSide="left"
                    onClick={() => remove(relation)}
                  />
                </div>
                {open && <RelationForm nodeId={nodeId} relation={relation} onDone={() => setEditing(null)} />}
              </div>
            );
          })}
        </div>
      ) : (
        !creating && (
          <p className="empty-copy">
            Sin relaciones. Pulsa «Nueva» o arrastra desde el punto de la tarjeta en el lienzo.
          </p>
        )
      )}
      <DerivedKinship nodeId={nodeId} />
    </section>
  );
}

/** Parentescos que el árbol deduce para este nodo (abuelos, hermanos, tíos, primos…) sin que haya relación explícita. */
function DerivedKinship({ nodeId }: { nodeId: string }) {
  const { project } = useApp();
  const { select } = useNavigation();
  const me = getNode(project, nodeId);
  if (!me) return null;
  const explicit = new Set(
    project.relations.flatMap(r => [`${r.sourceId}|${r.targetId}`, `${r.targetId}|${r.sourceId}`]),
  );
  const derived = project.schemas
    .filter(s => s.kind === 'relationship' && s.genealogical)
    .flatMap(s => derivedKinship(project, s.id))
    .filter(d => d.sourceId === nodeId && !explicit.has(`${d.sourceId}|${d.targetId}`));
  if (!derived.length) return null;
  return (
    <div className="derived-kin">
      <small className="muted">Deducido por el árbol (sin crear relación):</small>
      <ul>
        {derived.map(d => {
          const term = kinshipTerm(project, d.termId);
          const other = getNode(project, d.targetId);
          const via = getNode(project, d.via);
          if (!term || !other) return null;
          return (
            <li key={`${d.targetId}|${d.termId}`}>
              {kinshipName(term, nodeGender(project, me))} de{' '}
              <span
                className="relation-other"
                role="link"
                tabIndex={0}
                onClick={() => select({ kind: 'node', id: other.id }, { reveal: true })}
                onKeyDown={e => e.key === 'Enter' && select({ kind: 'node', id: other.id }, { reveal: true })}
              >
                {nodeLabel(project, other)}
              </span>
              {via && <span className="muted"> · por {nodeLabel(project, via)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Editor de una relación desde el punto de vista de `nodeId`. Sin `relation`, crea una nueva. */
function RelationForm({
  nodeId,
  relation,
  onDone,
}: {
  nodeId: string;
  relation?: Relation;
  onDone: (id?: string) => void;
}) {
  const { project, dispatch } = useApp();
  const me = getNode(project, nodeId);
  const myTypeId = me?.typeId ?? '';
  // Lados en los que este nodo encaja en cada tipo de relación.
  const sidesFor = (s: Schema) => ({
    source: typeMatches(project, myTypeId, s.sourceTypeIds),
    target: typeMatches(project, myTypeId, s.targetTypeIds),
  });
  // Solo los tipos que admiten a este nodo en algún extremo.
  const relationTypes = project.schemas.filter(s => {
    if (s.kind !== 'relationship') return false;
    const sides = sidesFor(s);
    return sides.source || sides.target;
  });
  const initialType = relation ? relation.typeId : (relationTypes[0]?.id ?? '');
  const [typeId, setTypeId] = useState(initialType);
  const [iAmSource, setIAmSource] = useState(() => {
    if (relation) return relation.sourceId === nodeId;
    const first = relationTypes[0];
    return first ? sidesFor(first).source : true;
  });
  const [otherId, setOtherId] = useState<string | null>(
    relation ? (relation.sourceId === nodeId ? relation.targetId : relation.sourceId) : null,
  );
  const [values, setValues] = useState<Record<string, FieldValue>>(relation?.values ?? {});
  const [reverseName, setReverseName] = useState(relation?.reverseName ?? '');
  // En parentesco el término siempre describe a este nodo: si la relación se guardó desde el otro
  // extremo, se muestra la contraparte y al guardar se normaliza con este nodo como origen.
  const [kinshipId, setKinshipId] = useState<string | null>(() => {
    if (!relation?.kinshipId) return null;
    if (relation.sourceId === nodeId) return relation.kinshipId;
    return kinshipTerm(project, relation.kinshipId)?.counterpartId ?? relation.kinshipId;
  });
  const [kinshipNeutral, setKinshipNeutral] = useState(relation?.kinshipNeutral ?? false);
  const schema = getSchema(project, typeId);
  const fields = schema ? allFields(project, schema.id) : [];

  const asSource = iAmSource || Boolean(schema?.genealogical);
  const otherEnd: 'sourceTypeIds' | 'targetTypeIds' = asSource ? 'targetTypeIds' : 'sourceTypeIds';
  const myEnd: 'sourceTypeIds' | 'targetTypeIds' = asSource ? 'sourceTypeIds' : 'targetTypeIds';
  const candidates = schema
    ? project.nodes.filter(n => n.id !== nodeId && typeMatches(project, n.typeId, schema[otherEnd]))
    : [];
  const myTypeOk = schema && me ? typeMatches(project, me.typeId, schema[myEnd]) : false;
  const validOther = otherId && candidates.some(n => n.id === otherId) ? otherId : null;
  const canSave = Boolean(schema && validOther && myTypeOk && (!schema.genealogical || kinshipId));

  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // El editor se abre dentro de la ficha: se trae a la vista para que no quede oculto abajo.
    formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const save = () => {
    if (!schema || !validOther) return;
    const asSource = iAmSource || schema.genealogical;
    const sourceId = asSource ? nodeId : validOther;
    const targetId = asSource ? validOther : nodeId;
    if (relation) {
      dispatch({
        type: 'update-relation',
        relation: {
          ...relation,
          typeId: schema.id,
          sourceId,
          targetId,
          values,
          reverseName,
          kinshipId,
          kinshipNeutral,
        },
      });
      onDone(relation.id);
    } else {
      const id = uid('rel');
      dispatch({ type: 'add-relation', typeId: schema.id, sourceId, targetId, id, values, reverseName, kinshipId });
      if (kinshipNeutral)
        dispatch({
          type: 'update-relation',
          relation: {
            id,
            typeId: schema.id,
            sourceId,
            targetId,
            values,
            reverseName,
            kinshipId,
            kinshipNeutral,
            createdAt: '',
          },
        });
      onDone(id);
    }
  };

  const typeOptions = relationTypes.map(s => schemaOption(s));
  const sides = schema ? sidesFor(schema) : { source: true, target: true };
  // El sentido solo se elige cuando este nodo encaja en los dos extremos.
  const canChooseSide = Boolean(schema?.directed && !schema.genealogical && sides.source && sides.target);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      onDone();
    } else if (event.key === 'Enter' && target.tagName !== 'TEXTAREA' && !target.closest('.popover')) {
      event.preventDefault();
      if (canSave) save();
    }
  };

  return (
    <div className="relation-form" ref={formRef} onKeyDown={onKeyDown}>
      <div className="form-grid">
        <div className="field">
          Tipo de relación
          <Select
            aria-label="Tipo de relación"
            options={typeOptions}
            value={typeId || null}
            placeholder={relationTypes.length ? 'Elegir tipo…' : 'Ningún tipo de relación admite este nodo'}
            onChange={id => {
              setTypeId(id ?? '');
              setOtherId(null);
              const next = relationTypes.find(s => s.id === id);
              // Si este nodo solo encaja en un extremo, se coloca ahí sin preguntar.
              if (next) {
                const s = sidesFor(next);
                setIAmSource(s.source ? true : !s.target ? true : false);
              }
            }}
          />
        </div>
        {canChooseSide && (
          <div className="field">
            Sentido
            <div className="segmented" role="group" aria-label="Sentido">
              <button type="button" aria-pressed={iAmSource} onClick={() => setIAmSource(true)}>
                {nodeLabel(project, me!)} → otro
              </button>
              <button type="button" aria-pressed={!iAmSource} onClick={() => setIAmSource(false)}>
                otro → {nodeLabel(project, me!)}
              </button>
            </div>
          </div>
        )}
        <div className="field">
          {asSource ? 'Con' : 'Desde'}
          <Select
            aria-label="Otro nodo"
            options={candidates.map(n => nodeOption(project, n))}
            value={validOther}
            placeholder={candidates.length ? 'Elegir nodo…' : 'Ningún nodo compatible'}
            onChange={setOtherId}
          />
          {schema && !myTypeOk && (
            <small className="validation-message">
              «{schema.name}» no admite un {getSchema(project, me?.typeId ?? '')?.name ?? 'nodo'} en este extremo.
            </small>
          )}
        </div>
        {schema?.genealogical && (
          <KinshipFields
            sourceId={nodeId}
            targetId={validOther}
            kinshipId={kinshipId}
            neutral={kinshipNeutral}
            onChange={patch => {
              if (patch.kinshipId !== undefined) setKinshipId(patch.kinshipId);
              if (patch.neutral !== undefined) setKinshipNeutral(patch.neutral);
            }}
          />
        )}
        {fields
          .filter(f => !(schema?.genealogical && f.isTitle))
          .map(f => (
            <label className="field" key={f.id}>
              {f.label}
              {f.type === 'longText' ? (
                <textarea
                  value={String(values[f.id] ?? '')}
                  onChange={e => setValues({ ...values, [f.id]: e.target.value })}
                />
              ) : (
                <input
                  value={String(values[f.id] ?? '')}
                  onChange={e => setValues({ ...values, [f.id]: e.target.value })}
                />
              )}
            </label>
          ))}
        {schema?.directed && !schema.genealogical && (
          <label className="field">
            <span>
              <ArrowLeftRight size={12} aria-hidden /> Visto desde el destino
            </span>
            <input
              value={reverseName}
              placeholder={schema.inverseName || 'Igual que el nombre'}
              onChange={e => setReverseName(e.target.value)}
            />
            <small>
              {schema.reciprocal
                ? 'Papel del otro lado: «Tía» desde el origen, «Sobrina» desde el destino.'
                : 'Opcional: cómo se llama la relación vista desde el destino.'}
            </small>
          </label>
        )}
        <div className="inspector-actions">
          <Button size="sm" variant="ghost" onClick={() => onDone()}>
            Cancelar
          </Button>
          <div className="spacer" />
          <Button size="sm" variant="primary" disabled={!canSave} onClick={save}>
            {relation ? 'Guardar' : 'Crear relación'}
          </Button>
        </div>
      </div>
    </div>
  );
}
