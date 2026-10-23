import { Check, MessageSquareText, MessagesSquare, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { visibleFields } from '../../domain/conditions';
import { nodeLabel } from '../../domain/selectors';
import type { FieldValue } from '../../domain/types';
import {
  createComment,
  deleteComment,
  listComments,
  setCommentState,
  SUGGESTIBLE,
  suggestedValue,
  type CommentState,
  type GroupComment,
} from '../../services/comments';
import { groupConversation, groupErrorMessage, spaceMembers, type GroupInfo } from '../../services/groups';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { Button, IconButton } from '../common/Button';
import { Splitter } from '../common/Splitter';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- así declara React los elementos propios
  namespace JSX {
    interface IntrinsicElements {
      /** La conversación del chat de la plataforma (`ecosistema-kit/CHAT.md`), del SDK. */
      'yosi-chat-conversacion': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        conversacion?: string;
        /** Con él, la conversación lleva un botón de volver (`yosi-chat-volver`), para el móvil. */
        volver?: string;
      };
    }
  }
}

export type GroupPanelTab = 'chat' | 'comentarios';

/**
 * El panel del grupo del proyecto abierto, junto a la vista: su chat (hito 4) y los comentarios y
 * sugerencias del proyecto (hito 5).
 */
export function GroupPanel({ group, onClose }: { group: GroupInfo; onClose: () => void }) {
  const { preferences, setPreference } = usePreferences();
  const tab = preferences.groupPanelTab;
  return (
    <aside className="side-panel right group-chat-panel" aria-label={`Grupo «${group.name}»`}>
      <Splitter
        width={preferences.groupChatWidth}
        grow="left"
        label="Redimensionar el panel del grupo"
        onChange={width => setPreference('groupChatWidth', width)}
      />
      <header className="group-chat-head">
        <nav className="segmented" aria-label="Panel del grupo">
          <button type="button" aria-pressed={tab === 'chat'} onClick={() => setPreference('groupPanelTab', 'chat')}>
            <MessagesSquare size={14} aria-hidden /> Chat
          </button>
          <button
            type="button"
            aria-pressed={tab === 'comentarios'}
            onClick={() => setPreference('groupPanelTab', 'comentarios')}
          >
            <MessageSquareText size={14} aria-hidden /> Comentarios
          </button>
        </nav>
        <strong title={group.name}>{group.name}</strong>
        <IconButton icon={X} label="Cerrar el panel del grupo" size="sm" onClick={onClose} />
      </header>
      {tab === 'chat' ? <GroupChat group={group} /> : <GroupComments group={group} />}
    </aside>
  );
}

/** La conversación del espacio en el chat de la plataforma, incrustada. Los mensajes no pasan por Nodaria. */
function GroupChat({ group }: { group: GroupInfo }) {
  const { getToken } = useAuth();
  const [conversation, setConversation] = useState<{ group: string; id: number } | null>(null);
  const [failure, setFailure] = useState<{ group: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Entra con tu cuenta de Yosiftware para chatear.');
        const { id } = await groupConversation(token, group.id);
        if (!cancelled) setConversation({ group: group.id, id });
      } catch (error) {
        if (!cancelled) setFailure({ group: group.id, message: groupErrorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, getToken]);

  const id = conversation?.group === group.id ? conversation.id : null;
  const error = failure?.group === group.id ? failure.message : null;
  if (error)
    return (
      <p className="group-error group-chat-message" role="alert">
        {error}
      </p>
    );
  if (id === null) return <p className="muted-note group-chat-message">Abriendo el chat del grupo…</p>;
  return <yosi-chat-conversacion key={id} conversacion={String(id)} />;
}

const STATE_LABELS: Record<CommentState, string> = {
  abierto: 'abierto',
  resuelto: 'resuelto',
  aceptado: 'aceptada',
  rechazado: 'rechazada',
};

const valueText = (value: FieldValue | undefined) =>
  value === undefined || value === null || value === ''
    ? '(vacío)'
    : Array.isArray(value)
      ? value.join(', ')
      : String(value);

/**
 * Comentarios y sugerencias del proyecto: del proyecto entero o de un nodo. Comentan y sugieren quienes
 * tienen `comment` (todos menos el lector); quien edita acepta o rechaza las sugerencias, y aceptar
 * aplica el valor en el proyecto como cualquier edición suya.
 */
function GroupComments({ group }: { group: GroupInfo }) {
  const { project, dispatch } = useApp();
  const { getToken, user } = useAuth();
  const { commentsTick } = useGroups();
  const { selection, select, openAgendaEntry } = useNavigation();
  const [comments, setComments] = useState<GroupComment[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyNode, setOnlyNode] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [body, setBody] = useState('');
  const [suggestFieldId, setSuggestFieldId] = useState('');
  const [suggestText, setSuggestText] = useState('');

  const selectedNode = selection?.kind === 'node' ? (project.nodes.find(n => n.id === selection.id) ?? null) : null;
  const caps = group.capabilities;

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setComments(await listComments(token, group.id, project.id));
      setError(null);
    } catch (failure) {
      setError(groupErrorMessage(failure));
    }
  }, [getToken, group.id, project.id]);
  // Se recargan al abrir, y cuando el canal del grupo avisa de cambios en los comentarios.
  useEffect(() => void load(), [load, commentsTick]);
  useEffect(() => {
    void spaceMembers(group.spaceId)
      .then(members => setNames(Object.fromEntries(members.map(m => [m.cuenta.toLowerCase(), m.nombre ?? m.alias]))))
      .catch(() => undefined);
  }, [group.spaceId]);

  const fields = useMemo(
    () => (selectedNode ? visibleFields(project, selectedNode).filter(f => SUGGESTIBLE.has(f.type)) : []),
    [project, selectedNode],
  );
  const suggestField = fields.find(f => f.id === suggestFieldId) ?? null;
  const suggestion = suggestField ? suggestedValue(suggestField, suggestText) : null;

  const visible = (comments ?? []).filter(
    c => (showClosed || c.state === 'abierto') && (!onlyNode || !selectedNode || c.nodeId === selectedNode.id),
  );
  const openCount = (comments ?? []).filter(c => c.state === 'abierto').length;

  const act = async (work: (token: string) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Entra con tu cuenta de Yosiftware.');
      await work(token);
      await load();
    } catch (failure) {
      setError(groupErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    act(async token => {
      await createComment(token, group.id, project.id, {
        nodeId: selectedNode?.id ?? null,
        body: body.trim(),
        suggestion: suggestField && suggestion !== null ? { fieldId: suggestField.id, value: suggestion } : null,
      });
      setBody('');
      setSuggestFieldId('');
      setSuggestText('');
    });

  const decide = (comment: GroupComment, state: CommentState) =>
    act(async token => {
      if (state === 'aceptado' && comment.suggestion) {
        const node = project.nodes.find(n => n.id === comment.nodeId);
        if (!node) throw new Error('El nodo de la sugerencia ya no existe: recházala.');
        dispatch({
          type: 'update-node',
          id: node.id,
          values: { ...node.values, [comment.suggestion.fieldId]: comment.suggestion.value },
          parentId: node.parentId,
        });
      }
      await setCommentState(token, group.id, project.id, comment.id, state);
    });

  const fieldName = (nodeId: string | null, fieldId: string) => {
    const node = project.nodes.find(n => n.id === nodeId);
    return (node && visibleFields(project, node).find(f => f.id === fieldId)?.label) ?? 'atributo';
  };

  return (
    <div className="group-comments">
      <div className="group-comments-filters">
        {selectedNode && (
          <label>
            <input type="checkbox" checked={onlyNode} onChange={e => setOnlyNode(e.target.checked)} /> Solo de «
            {nodeLabel(project, selectedNode)}»
          </label>
        )}
        <label>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Ver también los
          cerrados
        </label>
        <span className="field-hint">{openCount === 1 ? '1 abierto' : `${openCount} abiertos`}</span>
      </div>
      {error && (
        <p className="group-error" role="alert">
          {error}
        </p>
      )}
      <ul className="group-comment-list">
        {comments === null && <li className="muted-note">Cargando…</li>}
        {comments !== null && visible.length === 0 && (
          <li className="muted-note">
            {selectedNode && onlyNode ? 'Este nodo no tiene comentarios abiertos.' : 'No hay comentarios abiertos.'}
          </li>
        )}
        {visible.map(comment => {
          const mine = comment.author === user?.id;
          const node = comment.nodeId ? project.nodes.find(n => n.id === comment.nodeId) : null;
          // Los comentarios de una entrada de la agenda llevan su id como destino (`EntryPanel`).
          const entry = comment.nodeId && !node ? project.agenda.find(e => e.id === comment.nodeId) : undefined;
          const current = node && comment.suggestion ? node.values[comment.suggestion.fieldId] : undefined;
          return (
            <li key={comment.id} className={`group-comment ${comment.state}`}>
              <div className="group-comment-meta">
                <strong>{mine ? 'Tú' : (names[comment.author] ?? 'Antiguo miembro')}</strong>
                <span>
                  {new Date(comment.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                {comment.state !== 'abierto' && <span className="badge">{STATE_LABELS[comment.state]}</span>}
              </div>
              {entry && (
                <button
                  type="button"
                  className="link-button group-comment-node"
                  onClick={() => openAgendaEntry(entry.id)}
                >
                  Agenda: {entry.title.trim() || 'Sin título'}
                </button>
              )}
              {comment.nodeId && !entry && (
                <button
                  type="button"
                  className="link-button group-comment-node"
                  disabled={!node}
                  onClick={() => node && select({ kind: 'node', id: node.id })}
                >
                  {node ? nodeLabel(project, node) : 'Nodo borrado'}
                </button>
              )}
              <p className="group-comment-body">{comment.body}</p>
              {comment.suggestion && (
                <p className="group-comment-suggestion">
                  Sugiere {fieldName(comment.nodeId, comment.suggestion.fieldId)}: <s>{valueText(current)}</s> →{' '}
                  <strong>{valueText(comment.suggestion.value)}</strong>
                </p>
              )}
              <div className="group-comment-actions">
                {comment.suggestion && comment.state === 'abierto' && caps.edit && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Check}
                      disabled={busy}
                      onClick={() => void decide(comment, 'aceptado')}
                    >
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={X}
                      disabled={busy}
                      onClick={() => void decide(comment, 'rechazado')}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
                {!comment.suggestion && comment.state === 'abierto' && (caps.edit || mine) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Check}
                    disabled={busy}
                    onClick={() => void decide(comment, 'resuelto')}
                  >
                    Resolver
                  </Button>
                )}
                {comment.state === 'resuelto' && (caps.edit || mine) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RotateCcw}
                    disabled={busy}
                    onClick={() => void decide(comment, 'abierto')}
                  >
                    Reabrir
                  </Button>
                )}
                {(mine || group.isOwner) && (
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label="Borrar el comentario"
                    disabled={busy}
                    onClick={() => void act(token => deleteComment(token, group.id, project.id, comment.id))}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {caps.comment ? (
        <form
          className="group-comment-composer"
          onSubmit={event => {
            event.preventDefault();
            if (body.trim() && !busy) void send();
          }}
        >
          <textarea
            rows={3}
            maxLength={4000}
            value={body}
            aria-label="Comentario"
            placeholder={selectedNode ? `Comenta «${nodeLabel(project, selectedNode)}»…` : 'Comenta el proyecto…'}
            onChange={e => setBody(e.target.value)}
          />
          {selectedNode && fields.length > 0 && (
            <div className="group-comment-suggest">
              <select
                aria-label="Atributo que sugieres cambiar"
                value={suggestFieldId}
                onChange={e => {
                  setSuggestFieldId(e.target.value);
                  setSuggestText('');
                }}
              >
                <option value="">Sin sugerencia de valor</option>
                {fields.map(f => (
                  <option key={f.id} value={f.id}>
                    Sugerir {f.label}
                  </option>
                ))}
              </select>
              {suggestField &&
                (suggestField.type === 'select' ? (
                  <select
                    aria-label="Valor sugerido"
                    value={suggestText}
                    onChange={e => setSuggestText(e.target.value)}
                  >
                    <option value="">Elige…</option>
                    {suggestField.options.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Valor sugerido"
                    value={suggestText}
                    placeholder={suggestField.type === 'date' ? 'AAAA-MM-DD' : 'Valor sugerido'}
                    inputMode={suggestField.type === 'number' || suggestField.type === 'scale' ? 'decimal' : undefined}
                    onChange={e => setSuggestText(e.target.value)}
                  />
                ))}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || !body.trim() || (suggestField !== null && suggestion === null)}
          >
            {suggestField ? 'Enviar la sugerencia' : 'Comentar'}
          </Button>
        </form>
      ) : (
        <p className="muted-note group-chat-message">Tu rol en el grupo solo te deja leer los comentarios.</p>
      )}
    </div>
  );
}
