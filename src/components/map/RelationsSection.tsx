import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { nodeConnections } from '../../domain/connections';
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
    </section>
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
  const relationTypes = project.schemas.filter(s => s.kind === 'relationship');
  const initialType = relation
    ? relation.typeId
    : (relationTypes.find(s => typeMatches(project, getNode(project, nodeId)?.typeId ?? '', s.sourceTypeIds))?.id ??
      relationTypes[0]?.id ??
      '');
  const [typeId, setTypeId] = useState(initialType);
  const [iAmSource, setIAmSource] = useState(relation ? relation.sourceId === nodeId : true);
  const [otherId, setOtherId] = useState<string | null>(
    relation ? (relation.sourceId === nodeId ? relation.targetId : relation.sourceId) : null,
  );
  const [values, setValues] = useState<Record<string, FieldValue>>(relation?.values ?? {});
  const [reverseName, setReverseName] = useState(relation?.reverseName ?? '');
  const [kinshipId, setKinshipId] = useState<string | null>(relation?.kinshipId ?? null);
  const [kinshipNeutral, setKinshipNeutral] = useState(relation?.kinshipNeutral ?? false);
  const schema = getSchema(project, typeId);
  const fields = schema ? allFields(project, schema.id) : [];
  const me = getNode(project, nodeId);

  const otherEnd: 'sourceTypeIds' | 'targetTypeIds' = iAmSource ? 'targetTypeIds' : 'sourceTypeIds';
  const myEnd: 'sourceTypeIds' | 'targetTypeIds' = iAmSource ? 'sourceTypeIds' : 'targetTypeIds';
  const candidates = schema
    ? project.nodes.filter(n => n.id !== nodeId && typeMatches(project, n.typeId, schema[otherEnd]))
    : [];
  const myTypeOk = schema && me ? typeMatches(project, me.typeId, schema[myEnd]) : false;
  const validOther = otherId && candidates.some(n => n.id === otherId) ? otherId : null;
  const canSave = Boolean(schema && validOther && myTypeOk && (!schema.genealogical || kinshipId));

  const save = () => {
    if (!schema || !validOther) return;
    const sourceId = iAmSource ? nodeId : validOther;
    const targetId = iAmSource ? validOther : nodeId;
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
  const applicable = (s: Schema) =>
    me && (typeMatches(project, me.typeId, s.sourceTypeIds) || typeMatches(project, me.typeId, s.targetTypeIds));

  return (
    <div className="relation-form">
      <div className="form-grid">
        <div className="field">
          Tipo de relación
          <Select
            aria-label="Tipo de relación"
            options={typeOptions.map(o => ({
              ...o,
              disabled: !applicable(relationTypes.find(s => s.id === o.value)!),
            }))}
            value={typeId || null}
            onChange={id => {
              setTypeId(id ?? '');
              setOtherId(null);
            }}
          />
        </div>
        {schema?.directed && (
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
          {iAmSource ? 'Con' : 'Desde'}
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
            sourceId={iAmSource ? nodeId : validOther}
            targetId={iAmSource ? validOther : nodeId}
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
