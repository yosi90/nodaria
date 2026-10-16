import { Download, ExternalLink, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { databaseContext } from '../../domain/aiContext';
import { defaultSelection, reviewProposal } from '../../domain/aiProposal';
import { isTableType } from '../../domain/database';
import { getNode, nodeLabel } from '../../domain/selectors';
import { ApiError, OfflineError } from '../../services/api';
import {
  AI_KEY_ERRORS,
  deleteConversation,
  fetchAiModels,
  getConversation,
  listConversations,
  markApplied,
  requestDatabaseProposal,
  type AiAnswer,
  type AiConversationSummary,
  type AiMessage,
  type AiModelInfo,
  type AiModelsResponse,
} from '../../services/ai';
import { downloadText } from '../../services/files';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Splitter } from '../common/Splitter';
import { useToast } from '../common/toasts';

/*
 * Panel del asistente de IA (`docs/roadmaps/ROADMAP_IA.md`): una conversación por proyecto, al lado
 * de la vista, para seguir trabajando mientras se habla con la IA. El historial se guarda en la
 * cuenta (`api/src/ai/conversations.ts`). Cada propuesta se revisa dentro de la conversación contra
 * el proyecto actual, con las reglas del editor (`aiProposal.ts`), y se aplica en un solo paso
 * deshacible. Nada se aplica sin que la persona lo marque.
 */

const PROVIDERS: Record<AiModelInfo['provider'], string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const TIERS: Record<AiModelInfo['tier'], string> = {
  equilibrado: 'equilibrado',
  barato: 'más barato',
  calidad: 'máxima calidad',
};
const MAX_INSTRUCTION = 4000;

interface Failure {
  message: string;
  manage: boolean;
}

function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) return { message: error.message, manage: AI_KEY_ERRORS.has(error.code) };
  if (error instanceof OfflineError)
    return { message: 'No se ha podido conectar con Nodaria. Revisa tu conexión.', manage: false };
  return { message: 'No se ha podido completar la petición.', manage: false };
}

const modelKey = (m: AiModelInfo) => `${m.provider}:${m.id}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AiPanel({ onClose }: { onClose: () => void }) {
  const { project } = useApp();
  const { status, getToken, signIn } = useAuth();
  const { preferences, setPreference } = usePreferences();
  const { confirm } = useDialogs();

  const [catalog, setCatalog] = useState<AiModelsResponse | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { selection } = useNavigation();

  // Cerrar el panel o cambiar de proyecto mientras se espera cancela la petición.
  useEffect(() => () => abort.current?.abort(), []);

  const withToken = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new ApiError(401, 'no_autenticado', 'Tienes que iniciar sesión con tu cuenta de Yosiftware.');
    return token;
  }, [getToken]);

  // Modelos y conversaciones del proyecto; se abre la más reciente.
  useEffect(() => {
    if (status !== 'signed-in') return;
    let live = true;
    void (async () => {
      try {
        const token = await withToken();
        const [models, list] = await Promise.all([fetchAiModels(token), listConversations(token, project.id)]);
        if (!live) return;
        setCatalog(models);
        setConversations(list);
        setActiveId(current => current ?? list[0]?.id ?? null);
      } catch (error) {
        if (live) setLoadError(failureOf(error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [status, withToken, project.id]);

  useEffect(() => {
    if (status !== 'signed-in' || activeId === null) {
      setMessages([]);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const conversation = await getConversation(await withToken(), activeId);
        if (live) setMessages(conversation.messages);
      } catch (error) {
        if (live) setLoadError(failureOf(error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [status, activeId, withToken]);

  // Al llegar un mensaje nuevo, se baja hasta él.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length, waiting]);

  const models = catalog?.models ?? [];
  const model = models.find(m => modelKey(m) === preferences.aiModel) ?? models[0];
  const selected = selection?.kind === 'node' ? getNode(project, selection.id) : undefined;
  const selectedTable = selected && isTableType(project, selected.typeId) ? selected : null;
  const focusId = onlySelected && selectedTable ? selectedTable.id : null;
  const { context, refs } = useMemo(
    () => databaseContext(project, focusId ? [focusId] : undefined),
    [project, focusId],
  );
  const columnCount = context.tables.reduce((sum, t) => sum + t.columns.length, 0);

  const ask = async () => {
    const text = instruction.trim();
    if (!model || !text || waiting) return;
    setFailure(null);
    setWaiting(true);
    const controller = new AbortController();
    abort.current = controller;
    // La petición se ve ya en la conversación mientras se espera.
    const temporary: AiMessage = { id: -Date.now(), role: 'user', content: { instruction: text }, createdAt: '' };
    setMessages(current => [...current, temporary]);
    setInstruction('');
    try {
      const response = await requestDatabaseProposal(
        await withToken(),
        {
          provider: model.provider,
          model: model.id,
          instruction: text,
          context,
          refs,
          projectId: project.id,
          conversationId: activeId,
        },
        controller.signal,
      );
      const answer: AiMessage = {
        id: response.messageId ?? -Date.now(),
        role: 'assistant',
        content: { proposal: response.proposal, model: response.model, usage: response.usage, refs, applied: null },
        createdAt: new Date().toISOString(),
      };
      setMessages(current => [
        ...current.map(m => (m === temporary ? { ...m, id: response.userMessageId ?? m.id } : m)),
        answer,
      ]);
      if (activeId !== response.conversationId) {
        setActiveId(response.conversationId);
        setConversations(current => [
          { id: response.conversationId, projectId: project.id, title: text, createdAt: '', updatedAt: '' },
          ...current.filter(c => c.id !== response.conversationId),
        ]);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages(current => current.filter(m => m !== temporary));
        setInstruction(text);
      } else {
        const problem = failureOf(error);
        setFailure(problem);
        const conversationId = error instanceof ApiError ? error.details.conversationId : undefined;
        if (typeof conversationId === 'number' && conversationId !== activeId) {
          setActiveId(conversationId);
          setConversations(current => [
            { id: conversationId, projectId: project.id, title: text, createdAt: '', updatedAt: '' },
            ...current,
          ]);
        }
        setMessages(current => [
          ...current,
          { id: -Date.now(), role: 'error', content: { code: 'local', message: problem.message }, createdAt: '' },
        ]);
      }
    } finally {
      if (abort.current === controller) abort.current = null;
      setWaiting(false);
    }
  };

  const startNew = () => {
    abort.current?.abort();
    setActiveId(null);
    setMessages([]);
    setFailure(null);
  };

  const remove = async () => {
    if (activeId === null) return;
    const ok = await confirm({
      title: 'Borrar la conversación',
      message: 'Se borrará de tu cuenta con todas sus propuestas. Lo que ya aplicaste al proyecto se queda.',
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteConversation(await withToken(), activeId);
      setConversations(current => current.filter(c => c.id !== activeId));
      startNew();
    } catch (error) {
      setFailure(failureOf(error));
    }
  };

  const download = () => {
    const title = conversations.find(c => c.id === activeId)?.title ?? 'conversacion';
    downloadText(
      `${title.replace(/[^a-z0-9áéíóúüñ]+/gi, '_').slice(0, 60)}.json`,
      JSON.stringify({ project: project.name, title, messages }, null, 2),
      'application/json',
    );
  };

  const onApplied = (messageId: number, applied: number[]) => {
    setMessages(current =>
      current.map(m =>
        m.id === messageId && m.role === 'assistant'
          ? { ...m, content: { ...m.content, applied, appliedAt: new Date().toISOString() } }
          : m,
      ),
    );
    // Se apunta en la cuenta para que la IA sepa qué se aplicó; si falla, no se pierde nada del proyecto.
    if (messageId > 0)
      void withToken()
        .then(token => markApplied(token, messageId, applied))
        .catch(() => undefined);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask();
    }
  };

  const manageLink = catalog && (
    <a className="ai-manage" href={catalog.manageUrl} target="_blank" rel="noreferrer">
      Tus claves de IA y su tope <ExternalLink size={12} aria-hidden />
    </a>
  );
  const groups = (['anthropic', 'openai'] as const)
    .map(provider => ({ provider, models: models.filter(m => m.provider === provider) }))
    .filter(g => g.models.length);

  return (
    <aside className="side-panel right ai-panel" aria-label="Asistente de IA">
      <Splitter
        width={preferences.aiPanelWidth}
        grow="left"
        label="Redimensionar el asistente de IA"
        onChange={width => setPreference('aiPanelWidth', width)}
      />
      <header className="ai-panel-head">
        <Sparkles size={16} aria-hidden />
        <strong>Asistente de IA</strong>
        <span className="ai-panel-actions">
          {status === 'signed-in' && (
            <>
              <IconButton icon={Plus} label="Nueva conversación" size="sm" onClick={startNew} />
              <IconButton
                icon={Download}
                label="Descargar la conversación"
                size="sm"
                disabled={!messages.length}
                onClick={download}
              />
              <IconButton
                icon={Trash2}
                label="Borrar la conversación"
                size="sm"
                disabled={activeId === null}
                onClick={() => void remove()}
              />
            </>
          )}
          <IconButton icon={X} label="Cerrar el asistente" size="sm" onClick={onClose} />
        </span>
      </header>

      {status !== 'signed-in' ? (
        <div className="ai-panel-empty">
          <p className="muted-note">
            {status === 'unavailable'
              ? 'La cuenta de Yosiftware no está disponible ahora mismo. Inténtalo más tarde.'
              : 'El asistente usa tus propias claves de IA, guardadas en tu cuenta de Yosiftware, y guarda allí tus conversaciones. Inicia sesión para usarlo.'}
          </p>
          {status === 'signed-out' && (
            <Button variant="primary" onClick={() => void signIn()}>
              Iniciar sesión
            </Button>
          )}
        </div>
      ) : (
        <>
          {conversations.length > 0 && (
            <label className="ai-conversation-picker">
              <span className="visually-hidden">Conversación</span>
              <select
                value={activeId ?? ''}
                disabled={waiting}
                onChange={event => setActiveId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Nueva conversación</option>
                {conversations.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ai-thread" ref={scroller} aria-live="polite">
            {loadError && <p className="ai-error">{loadError}</p>}
            {!messages.length && !waiting && (
              <div className="ai-panel-empty">
                <p className="muted-note">
                  Describe qué quieres hacer con el esquema: crear tablas, añadir columnas o claves, corregir tipos… La
                  IA propone cambios y tú decides cuáles aplicar. Puedes seguir trabajando mientras tanto.
                </p>
              </div>
            )}
            {messages.map(m =>
              m.role === 'user' ? (
                <p key={m.id} className="ai-bubble">
                  {m.content.instruction}
                </p>
              ) : m.role === 'assistant' ? (
                <ProposalCard key={m.id} messageId={m.id} answer={m.content} onApplied={onApplied} />
              ) : (
                <p key={m.id} className="ai-error" role="alert">
                  {m.content.message}
                </p>
              ),
            )}
            {waiting && (
              <div className="ai-waiting" role="status">
                <span>Pensando… puede tardar un poco.</span>
                <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
                  Cancelar
                </Button>
              </div>
            )}
            {failure?.manage && catalog && (
              <p className="ai-error">
                <a href={catalog.manageUrl} target="_blank" rel="noreferrer">
                  Gestionar mis claves de IA
                </a>
              </p>
            )}
          </div>

          <form
            className="ai-composer"
            onSubmit={event => {
              event.preventDefault();
              void ask();
            }}
          >
            <textarea
              rows={3}
              maxLength={MAX_INSTRUCTION}
              value={instruction}
              disabled={!model}
              aria-label="Mensaje para la IA"
              placeholder={
                context.tables.length
                  ? 'Añade las líneas de pedido con su artículo, cantidad y precio.'
                  : 'Una tienda con clientes, productos, pedidos y sus líneas.'
              }
              onChange={event => setInstruction(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="ai-composer-row">
              <select
                aria-label="Modelo"
                value={model ? modelKey(model) : ''}
                disabled={waiting || !models.length}
                onChange={event => setPreference('aiModel', event.target.value)}
              >
                {!models.length && <option value="">Cargando…</option>}
                {groups.map(g => (
                  <optgroup key={g.provider} label={PROVIDERS[g.provider]}>
                    {g.models.map(m => (
                      <option key={modelKey(m)} value={modelKey(m)}>
                        {m.label} · {TIERS[m.tier]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={waiting || !model || !instruction.trim()}
                aria-label="Enviar"
              >
                <Send size={14} aria-hidden /> Enviar
              </Button>
            </div>
            {selectedTable && (
              <label className="field-inline ai-scope">
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={event => setOnlySelected(event.target.checked)}
                />
                Solo «{nodeLabel(project, selectedTable)}» (del resto, sus claves)
              </label>
            )}
            <p className="ai-privacy-line">
              Se envía {model ? `a ${PROVIDERS[model.provider]}` : 'al proveedor'}, con tu clave:{' '}
              {plural(context.tables.length, 'tabla', 'tablas')} y {plural(columnCount, 'columna', 'columnas')}, bases y
              preformas (sin notas ni datos de fichas). La conversación se guarda en tu cuenta. {manageLink}
            </p>
          </form>
        </>
      )}
    </aside>
  );
}

/** Una propuesta dentro de la conversación: se revisa contra el proyecto actual y se aplica marcando operaciones. */
function ProposalCard({
  messageId,
  answer,
  onApplied,
}: {
  messageId: number;
  answer: AiAnswer;
  onApplied: (messageId: number, applied: number[]) => void;
}) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const [selected, setSelected] = useState(() => defaultSelection(answer.proposal));
  // Semilla fija por mensaje: la vista previa y lo aplicado coinciden.
  const [seed] = useState(() => `${Math.abs(messageId).toString(36)}${Date.now().toString(36)}`);
  const done = answer.applied !== null;
  // Una propuesta ya resuelta solo se revisa para nombrar sus operaciones; no se vuelve a aplicar.
  const fullReview = useMemo(
    () => reviewProposal(project, answer.proposal, answer.refs, done ? [] : selected, seed),
    [done, project, answer, selected, seed],
  );
  const review = done ? null : fullReview;
  const applicable = review?.operations.filter(o => o.applied).length ?? 0;

  const toggle = (index: number) =>
    setSelected(current =>
      current.includes(index) ? current.filter(i => i !== index) : [...current, index].sort((a, b) => a - b),
    );

  const apply = () => {
    if (!review || !applicable) return;
    const applied = review.operations.filter(o => o.applied).map(o => o.index);
    dispatch({ type: 'apply-ai-proposal', proposal: answer.proposal, refs: answer.refs, selected, seed });
    toast({ message: `Aplicados ${plural(applicable, 'cambio', 'cambios')} de la IA`, undoable: true });
    onApplied(messageId, applied);
  };

  return (
    <article className="ai-card">
      <p className="ai-summary">{answer.proposal.summary || 'Sin resumen.'}</p>
      <p className="ai-meta">
        {answer.model.label}
        {done &&
          ` · ${answer.applied!.length ? `aplicados ${plural(answer.applied!.length, 'cambio', 'cambios')}` : 'descartada'}`}
      </p>
      {done ? (
        <ul className="ai-ops compact">
          {fullReview.operations.map(o => (
            <li key={o.index} className={`ai-op ${answer.applied!.includes(o.index) ? 'ok' : 'skipped'}`}>
              <span className="ai-op-title">
                {answer.applied!.includes(o.index) ? '✓ ' : ''}
                {o.title}
              </span>
            </li>
          ))}
        </ul>
      ) : review && review.operations.length ? (
        <ul className="ai-ops">
          {review.operations.map(o => (
            <li key={o.index} className={`ai-op ${o.status}`}>
              <label>
                <input
                  type="checkbox"
                  checked={o.selected}
                  disabled={o.status === 'invalid' && !o.selected}
                  onChange={() => toggle(o.index)}
                />
                <span className="ai-op-title">{o.title}</span>
                {o.destructive && <span className="badge danger">Borra</span>}
                {o.status === 'warning' && <span className="badge warning">Revisar</span>}
                {o.status === 'invalid' && <span className="badge danger">No se puede aplicar</span>}
              </label>
              {o.operation.reason && <p className="ai-op-reason">{o.operation.reason}</p>}
              {o.messages.map(message => (
                <p key={message} className="ai-op-message">
                  {message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-note">La IA no propone cambios.</p>
      )}
      {!!answer.proposal.advice.length && (
        <section className="ai-section">
          <h3>Recomendaciones</h3>
          <ul>
            {answer.proposal.advice.map(a => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {!!review?.issues.length && (
        <section className="ai-section">
          <h3>Avisos que quedarían en las tablas</h3>
          <ul>
            {review.issues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
      {!done && (
        <div className="ai-card-actions">
          <Button variant="ghost" size="sm" onClick={() => onApplied(messageId, [])}>
            Descartar
          </Button>
          <Button variant="primary" size="sm" disabled={!applicable} onClick={apply}>
            {applicable ? `Aplicar ${plural(applicable, 'cambio', 'cambios')}` : 'Nada que aplicar'}
          </Button>
        </div>
      )}
    </article>
  );
}
