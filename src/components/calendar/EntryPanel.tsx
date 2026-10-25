import { AtSign, MessageSquare, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AGENDA_KINDS,
  addDays,
  isCheckable,
  isOverdue,
  longDate,
  mentionedInEntry,
  todayText,
  type AgendaEntry,
  type AgendaPatch,
} from '../../domain/agenda';
import { mentionIndex, segmentNotes } from '../../domain/notes';
import { getNode, nodeLabel } from '../../domain/selectors';
import { createComment, deleteComment, setCommentState } from '../../services/comments';
import type { GroupInfo, SpaceMember } from '../../services/groups';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useNavigation } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { NodeAvatar } from '../common/NodeAvatar';
import { OptionList } from '../common/OptionList';
import { nodeOption } from '../common/options';
import { Popover } from '../common/Popover';
import { MultiSelect } from '../common/Select';
import { CommentItem } from '../groups/CommentItem';
import { useGroupComments } from '../groups/useGroupComments';
import { KindIcon } from './agendaParts';

interface EntryPanelProps {
  entry: AgendaEntry;
  /** Recién creada: el título se enfoca para escribirlo. */
  focusTitle: boolean;
  canEdit: boolean;
  group: GroupInfo | null;
  members: SpaceMember[];
  nameOf: (account: string) => string;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Ficha de una entrada de la agenda, en el panel lateral de la vista «Calendario». Cada cambio es una
 * acción deshacible; los cambios seguidos de la misma entrada se deshacen juntos, como en las fichas.
 */
export function EntryPanel({ entry, focusTitle, canEdit, group, members, nameOf, onClose, onDelete }: EntryPanelProps) {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const title = useRef<HTMLInputElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const [mentionAnchor, setMentionAnchor] = useState<Anchor | null>(null);
  const closeMentions = useCallback(() => setMentionAnchor(null), []);
  const today = todayText();
  const set = (patch: AgendaPatch) => dispatch({ type: 'update-agenda-entry', id: entry.id, patch });

  useEffect(() => {
    if (!focusTitle) return;
    title.current?.focus();
    title.current?.select();
  }, [focusTitle]);

  const index = useMemo(() => mentionIndex(project), [project]);
  const connected = useMemo(() => {
    const ids = [...entry.nodeIds, ...mentionedInEntry(project, entry, index).map(n => n.id)];
    return [...new Set(ids)].map(id => getNode(project, id)).filter(n => n !== undefined);
  }, [project, entry, index]);
  const nodeOptions = useMemo(() => project.nodes.map(n => nodeOption(project, n)), [project]);

  const insertMention = (id: string) => {
    const target = getNode(project, id);
    const el = description.current;
    if (!target) return;
    const mention = `[[${nodeLabel(project, target)}]]`;
    const text = entry.description;
    const untouched = !el || (el.selectionStart === 0 && el.selectionEnd === 0 && text.length > 0);
    const start = untouched ? text.length : el.selectionStart;
    const end = untouched ? start : el.selectionEnd;
    const prefix = start > 0 && !/\s/.test(text[start - 1]) ? ' ' : '';
    set({ description: text.slice(0, start) + prefix + mention + text.slice(end) });
    setMentionAnchor(null);
    window.setTimeout(() => {
      el?.focus();
      const caret = start + prefix.length + mention.length;
      el?.setSelectionRange(caret, caret);
    }, 0);
  };

  const multiDay = entry.endDate !== null;
  const overdue = isOverdue(entry, today);

  return (
    <>
      <header className="inspector-head agenda-panel-head">
        <KindIcon kind={entry.kind} size={20} />
        <div className="titles">
          <h2>{entry.title.trim() || 'Sin título'}</h2>
          <small>
            {longDate(entry.date)}
            {entry.endDate ? ` – ${longDate(entry.endDate)}` : ''}
            {entry.time ? ` · ${entry.time}` : ''}
            {overdue ? ' · vencida' : ''}
          </small>
        </div>
        {canEdit && <IconButton icon={Trash2} label="Eliminar la entrada" onClick={onDelete} />}
        <IconButton icon={X} label="Cerrar" onClick={onClose} />
      </header>
      <div className="panel-body agenda-panel-body">
        <div className="segmented agenda-kind-picker" role="group" aria-label="Tipo de entrada">
          {AGENDA_KINDS.map(k => (
            <button
              key={k.id}
              type="button"
              aria-pressed={entry.kind === k.id}
              disabled={!canEdit}
              onClick={() => set({ kind: k.id })}
            >
              <KindIcon kind={k.id} /> {k.label}
            </button>
          ))}
        </div>

        <label className="field">
          Título
          <input
            ref={title}
            value={entry.title}
            disabled={!canEdit}
            placeholder="Qué hay que hacer, entregar o recordar"
            onChange={e => set({ title: e.target.value })}
          />
        </label>

        <div className="agenda-dates">
          <label className="field">
            {multiDay ? 'Desde' : 'Día'}
            <input
              type="date"
              value={entry.date}
              disabled={!canEdit}
              onChange={e => e.target.value && set({ date: e.target.value })}
            />
          </label>
          {multiDay && (
            <label className="field">
              Hasta
              <input
                type="date"
                value={entry.endDate ?? ''}
                min={entry.date}
                disabled={!canEdit}
                onChange={e => set({ endDate: e.target.value || null })}
              />
            </label>
          )}
          <label className="field">
            Hora
            <input
              type="time"
              value={entry.time ?? ''}
              disabled={!canEdit}
              onChange={e => set({ time: e.target.value || null })}
            />
          </label>
        </div>
        <div className="check-row">
          <label>
            <input
              type="checkbox"
              checked={multiDay}
              disabled={!canEdit}
              onChange={e => set({ endDate: e.target.checked ? addDays(entry.date, 1) : null })}
            />
            Varios días
          </label>
          {isCheckable(entry.kind) && (
            <label>
              <input
                type="checkbox"
                checked={entry.done}
                disabled={!canEdit}
                onChange={e => set({ done: e.target.checked })}
              />
              Hecha
            </label>
          )}
        </div>

        {group && (
          <label className="field">
            Asignada a
            <select
              value={entry.assignee ?? ''}
              disabled={!canEdit}
              onChange={e => set({ assignee: e.target.value || null })}
            >
              <option value="">Nadie</option>
              {members.map(m => (
                <option key={m.cuenta} value={m.cuenta}>
                  {m.nombre ?? m.alias}
                </option>
              ))}
              {entry.assignee && !members.some(m => m.cuenta.toLowerCase() === entry.assignee!.toLowerCase()) && (
                <option value={entry.assignee}>{nameOf(entry.assignee)}</option>
              )}
            </select>
          </label>
        )}

        <div className="field">
          <span className="agenda-field-head">
            Descripción
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                icon={AtSign}
                onClick={e => setMentionAnchor(anchorOf(e.currentTarget))}
              >
                Mencionar
              </Button>
            )}
          </span>
          <textarea
            ref={description}
            rows={5}
            value={entry.description}
            disabled={!canEdit}
            placeholder="Detalles, enlaces, dudas… Escribe [[Nombre]] para mencionar un nodo."
            onChange={e => set({ description: e.target.value })}
          />
          {entry.description.includes('[[') && (
            <p className="agenda-mentions">
              {segmentNotes(project, entry.description, index)
                .filter(s => s.kind === 'mention')
                .map((s, i) =>
                  s.kind === 'mention' && s.node ? (
                    <button
                      key={i}
                      type="button"
                      className="mention"
                      onClick={() => select({ kind: 'node', id: s.node!.id }, { reveal: true })}
                    >
                      {s.name}
                    </button>
                  ) : (
                    s.kind === 'mention' && (
                      <span key={i} className="mention missing" title="No hay ningún nodo con este nombre">
                        {s.name}
                      </span>
                    )
                  ),
                )}
            </p>
          )}
        </div>

        <div className="field">
          <span>Nodos enlazados</span>
          <MultiSelect
            options={nodeOptions}
            value={entry.nodeIds.filter(id => getNode(project, id))}
            disabled={!canEdit}
            addLabel="Enlazar"
            emptyText={canEdit ? undefined : 'Ninguno'}
            onChange={nodeIds => set({ nodeIds })}
          />
        </div>

        {connected.length > 0 && (
          <div className="agenda-connected">
            <span className="field-hint">Ir al nodo</span>
            {connected.map(node => (
              <button
                key={node.id}
                type="button"
                className="agenda-node-link"
                onClick={() => select({ kind: 'node', id: node.id }, { reveal: true })}
              >
                <NodeAvatar project={project} node={node} size="sm" />
                <span>{nodeLabel(project, node)}</span>
              </button>
            ))}
          </div>
        )}

        {group && <EntryComments group={group} entryId={entry.id} nameOf={nameOf} />}
      </div>
      {mentionAnchor && (
        <Popover anchor={mentionAnchor} onClose={closeMentions} matchWidth>
          <OptionList
            title="Mencionar a"
            options={nodeOptions}
            selected={[]}
            onPick={insertMention}
            searchThreshold={0}
          />
        </Popover>
      )}
    </>
  );
}

/**
 * Comentarios de la entrada en un proyecto de grupo: los mismos de la pestaña «Comentarios» del panel del
 * grupo, con la entrada como destino. Comenta quien tiene `comment` (también el revisor, que no edita).
 */
function EntryComments({
  group,
  entryId,
  nameOf,
}: {
  group: GroupInfo;
  entryId: string;
  nameOf: (account: string) => string;
}) {
  const { project } = useApp();
  const { user } = useAuth();
  const { comments: all, error, busy, act } = useGroupComments(group);
  const comments = all && all.filter(c => c.nodeId === entryId);
  const [body, setBody] = useState('');
  const caps = group.capabilities;

  return (
    <section className="agenda-comments">
      <h3>
        <MessageSquare size={14} aria-hidden /> Comentarios
      </h3>
      {error && (
        <p className="group-error" role="alert">
          {error}
        </p>
      )}
      <ul className="group-comment-list">
        {comments === null && <li className="muted-note">Cargando…</li>}
        {comments?.length === 0 && <li className="muted-note">Nadie ha comentado esta entrada.</li>}
        {comments?.map(comment => {
          const mine = comment.author === user?.id;
          return (
            <CommentItem
              key={comment.id}
              comment={comment}
              author={mine ? 'Tú' : nameOf(comment.author)}
              stateLabel="resuelto"
              canChange={caps.edit || mine}
              canDelete={mine || group.isOwner}
              busy={busy}
              onState={state => void act(token => setCommentState(token, group.id, project.id, comment.id, state))}
              onDelete={() => void act(token => deleteComment(token, group.id, project.id, comment.id))}
            />
          );
        })}
      </ul>
      {caps.comment ? (
        <form
          className="group-comment-composer"
          onSubmit={event => {
            event.preventDefault();
            const text = body.trim();
            if (!text || busy) return;
            void act(async token => {
              await createComment(token, group.id, project.id, { nodeId: entryId, body: text, suggestion: null });
              setBody('');
            });
          }}
        >
          <textarea
            rows={2}
            maxLength={4000}
            value={body}
            aria-label="Comentario sobre la entrada"
            placeholder="Comenta esta entrada…"
            onChange={e => setBody(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" disabled={busy || !body.trim()}>
            Comentar
          </Button>
        </form>
      ) : (
        <p className="muted-note">Tu rol en el grupo solo te deja leer los comentarios.</p>
      )}
    </section>
  );
}
