import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cardinalityIssues, cardinalityWarning, describeIssue } from '../../domain/cardinality';
import { nodeConnections } from '../../domain/connections';
import {
  derivedKinship,
  kinshipConflicts,
  kinshipName,
  kinshipSuspects,
  kinshipTerm,
  nodeGender,
} from '../../domain/kinship';
import { uid } from '../../domain/factories';
import { relationEnds } from '../../domain/constraints';
import { allFields, getNode, getSchema, nodeLabel, relationRole, typeMatches } from '../../domain/selectors';
import type { FieldValue, Node, Relation, Schema } from '../../domain/types';
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
  // Parentescos que no cuadran con las generaciones del árbol (suele ser una ascendencia al revés).
  const conflicts = new Map(
    relationTypes
      .filter(s => s.genealogical)
      .flatMap(s => kinshipConflicts(project, s.id))
      .map(c => [c.relation.id, c] as const),
  );
  // Relaciones de ascendencia que, invertidas, hacen cuadrar al resto: la causa más probable.
  const suspects = new Map(
    relationTypes.filter(s => s.genealogical).flatMap(s => [...kinshipSuspects(project, s.id).entries()]),
  );
  if (!connections) return null;

  const invert = (relation: Relation) => {
    dispatch({
      type: 'update-relation',
      relation: { ...relation, sourceId: relation.targetId, targetId: relation.sourceId },
    });
    toast({ message: 'Relación invertida: ahora cada uno tiene el papel del otro', undoable: true });
  };

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
            const conflict = conflicts.get(relation.id);
            const suspect = suspects.get(relation.id);
            const suspectText = suspect
              ? `Parece estar al revés: invertida, cuadra${suspect === 1 ? '' : 'n'} ${suspect} parentesco${suspect === 1 ? '' : 's'} más. Ahora dice que ${mine.toLowerCase()} es ${nodeLabel(project, getNode(project, nodeId)!)} y ${theirs.toLowerCase()} es ${nodeLabel(project, other)}.`
              : undefined;
            const conflictText = conflict
              ? `No cuadra con la ascendencia registrada: ${nodeLabel(project, other)} debería estar ${Math.abs(conflict.expected)} generación${Math.abs(conflict.expected) === 1 ? '' : 'es'} ${(direction === 'out' ? conflict.expected : -conflict.expected) > 0 ? 'por debajo' : 'por encima'} y está ${conflict.actual === 0 ? 'a la misma altura' : `${Math.abs(conflict.actual)} ${(direction === 'out' ? conflict.actual : -conflict.actual) > 0 ? 'por debajo' : 'por encima'}`}. Si alguna relación de progenitor o hijo está al revés, usa «Invertir» en ella.`
              : undefined;
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
                    {suspect ? (
                      <span className="node-mark danger" title={suspectText}>
                        <TriangleAlert size={13} aria-label="Parece estar al revés" />
                      </span>
                    ) : (
                      conflict && (
                        <span className="node-mark warning" title={conflictText}>
                          <TriangleAlert size={13} aria-label="No cuadra con el árbol" />
                        </span>
                      )
                    )}
                    <span className="badge">{schema?.name}</span>
                  </button>
                  {schema?.genealogical && (
                    <IconButton
                      icon={ArrowLeftRight}
                      size="sm"
                      variant={suspect ? 'danger' : 'ghost'}
                      label={suspect ? 'Invertir (parece estar al revés)' : 'Invertir: intercambiar quién es quién'}
                      tooltipSide="left"
                      onClick={() => invert(relation)}
                    />
                  )}
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
      {cardinalityIssues(project, nodeId).map(issue => (
        <p className="muted-note conflict-note" key={`${issue.schema.id}-${issue.end}`}>
          <TriangleAlert size={12} aria-hidden /> {describeIssue(project, issue)}
        </p>
      ))}
      {connections.relations.some(c => conflicts.has(c.relation.id) || suspects.has(c.relation.id)) && (
        <p className="muted-note conflict-note">
          <TriangleAlert size={12} aria-hidden />{' '}
          {connections.relations.some(c => suspects.has(c.relation.id))
            ? 'Una relación de ascendencia de esta ficha parece guardada al revés (marcada en rojo): pulsa «Invertir» en ella.'
            : (() => {
                const culprits = [...suspects.keys()]
                  .map(id => project.relations.find(r => r.id === id))
                  .filter((r): r is Relation => Boolean(r))
                  .map(
                    r =>
                      `${nodeLabel(project, getNode(project, r.sourceId)!)} – ${nodeLabel(project, getNode(project, r.targetId)!)}`,
                  );
                return culprits.length
                  ? `Hay parentescos que no cuadran con la ascendencia registrada. La causa probable está en otra ficha: ${culprits.join(', ')} (parece al revés; ábrela y pulsa «Invertir»).`
                  : 'Hay parentescos que no cuadran con la ascendencia registrada. Comprueba la frase de cada relación de progenitor o hijo implicada.';
              })()}
        </p>
      )}
      <DerivedKinship nodeId={nodeId} />
    </section>
  );
}

/**
 * Quién es quién en la relación que se está editando: origen a la izquierda, destino a la derecha, la
 * flecha con el nombre del papel y, cuando este nodo encaja en los dos extremos, un botón para
 * intercambiarlos.
 */
function RelationPreview({
  schema,
  me,
  other,
  iAmSource,
  kinshipId,
  kinshipNeutral,
  reverseName,
  onSwap,
}: {
  schema: Schema;
  me: Node;
  other: Node | undefined;
  iAmSource: boolean;
  kinshipId: string | null;
  kinshipNeutral: boolean;
  reverseName: string;
  onSwap?: () => void;
}) {
  const { project } = useApp();
  const source = iAmSource ? me : other;
  const target = iAmSource ? other : me;
  const term = kinshipTerm(project, kinshipId);
  const counterpart = term ? (kinshipTerm(project, term.counterpartId) ?? term) : undefined;
  const forward = term ? kinshipName(term, nodeGender(project, source), kinshipNeutral) : schema.name;
  const backward = term
    ? kinshipName(counterpart!, nodeGender(project, target), kinshipNeutral)
    : reverseName || schema.inverseName || '';
  const card = (node: Node | undefined, role: 'origen' | 'destino') => {
    const s = node ? getSchema(project, node.typeId) : undefined;
    const mine = node?.id === me.id;
    return (
      <div className={`rp-node ${mine ? 'me' : ''} ${node ? '' : 'empty'}`}>
        {node ? (
          <>
            <TypeIcon icon={s?.icon} color={s?.color} size="sm" />
            <span className="rp-name">
              <strong>{nodeLabel(project, node)}</strong>
              <small>{s?.name}</small>
            </span>
          </>
        ) : (
          <span className="rp-name">
            <strong>¿Con quién?</strong>
            <small>elige el nodo</small>
          </span>
        )}
        <em>{mine ? `yo · ${role}` : role}</em>
      </div>
    );
  };
  const sentence = term
    ? source && target
      ? `${nodeLabel(project, source)} es ${forward.toLowerCase()} de ${nodeLabel(project, target)}; ${nodeLabel(project, target)} es ${backward.toLowerCase()} de ${nodeLabel(project, source)}.`
      : `${nodeLabel(project, me)} es ${forward.toLowerCase()} de… (elige el nodo)`
    : schema.genealogical
      ? `${nodeLabel(project, me)} es … de ${other ? nodeLabel(project, other) : '…'} (elige el parentesco)`
      : schema.directed
        ? `${source ? nodeLabel(project, source) : '…'} → ${schema.name} → ${target ? nodeLabel(project, target) : '…'}${backward ? ` (visto desde ${target ? nodeLabel(project, target) : 'el destino'}: ${backward})` : ''}`
        : `${nodeLabel(project, me)} y ${other ? nodeLabel(project, other) : '…'}: ${schema.name} (sin sentido).`;
  return (
    <div className="relation-preview">
      <div className="rp-row">
        {card(source, 'origen')}
        <div
          className={`rp-arrow ${schema.directed ? 'directed' : ''}`}
          style={{ '--rp-color': schema.color } as React.CSSProperties}
        >
          <span className="rp-label">{forward}</span>
          <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
            <line x1="0" y1="6" x2={schema.directed ? 92 : 100} y2="6" />
            {schema.directed && <polygon points="90,1 100,6 90,11" />}
          </svg>
          {backward && backward !== forward && <span className="rp-label back">{backward}</span>}
        </div>
        {card(target, 'destino')}
        {onSwap && (
          <IconButton
            icon={ArrowLeftRight}
            size="sm"
            variant="ghost"
            label="Intercambiar origen y destino"
            tooltipSide="left"
            onClick={onSwap}
          />
        )}
      </div>
      <small className="rp-sentence">{sentence}</small>
    </div>
  );
}

/** Parentescos que el árbol deduce para este nodo (abuelos, hermanos, tíos, primos…) sin que haya relación explícita. */
function DerivedKinship({ nodeId }: { nodeId: string }) {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const toast = useToast();
  const me = getNode(project, nodeId);
  if (!me) return null;
  const explicit = new Set(
    project.relations.flatMap(r => [`${r.sourceId}|${r.targetId}`, `${r.targetId}|${r.sourceId}`]),
  );
  const derived = project.schemas
    .filter(s => s.kind === 'relationship' && s.genealogical)
    .flatMap(s => derivedKinship(project, s.id).map(d => ({ ...d, typeId: s.id })))
    .filter(d => d.sourceId === nodeId && !explicit.has(`${d.sourceId}|${d.targetId}`));
  if (!derived.length) return null;
  const establish = (d: (typeof derived)[number]) => {
    dispatch({
      type: 'add-relation',
      typeId: d.typeId,
      sourceId: d.sourceId,
      targetId: d.targetId,
      id: uid('rel'),
      kinshipId: d.termId,
    });
    toast({ message: 'Parentesco establecido como relación', undoable: true });
  };
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
              <Button size="sm" variant="ghost" onClick={() => establish(d)}>
                Establecer
              </Button>
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
  const toast = useToast();
  const me = getNode(project, nodeId);
  const myTypeId = me?.typeId ?? '';
  // Lados en los que este nodo encaja en cada tipo de relación.
  const sidesFor = (s: Schema) => {
    const ends = relationEnds(project, s);
    return { source: typeMatches(project, myTypeId, ends.source), target: typeMatches(project, myTypeId, ends.target) };
  };
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
  const ends = schema ? relationEnds(project, schema) : { source: [], target: [] };
  const otherEnd = asSource ? ends.target : ends.source;
  const myEnd = asSource ? ends.source : ends.target;
  const candidates = schema
    ? project.nodes.filter(n => n.id !== nodeId && typeMatches(project, n.typeId, otherEnd))
    : [];
  const myTypeOk = schema && me ? typeMatches(project, me.typeId, myEnd) : false;
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
      const warning = cardinalityWarning(project, schema.id, sourceId, targetId);
      dispatch({ type: 'add-relation', typeId: schema.id, sourceId, targetId, id, values, reverseName, kinshipId });
      if (warning) toast({ message: `Límite superado: ${warning}` });
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
        {schema && me && (
          <RelationPreview
            schema={schema}
            me={me}
            other={validOther ? getNode(project, validOther) : undefined}
            iAmSource={asSource}
            kinshipId={schema.genealogical ? kinshipId : null}
            kinshipNeutral={kinshipNeutral}
            reverseName={reverseName}
            onSwap={canChooseSide ? () => setIAmSource(v => !v) : undefined}
          />
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
