import { ExternalLink, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { databaseContext, type AiContextRefs } from '../../domain/aiContext';
import { defaultSelection, reviewProposal, type AiProposal } from '../../domain/aiProposal';
import { isTableType } from '../../domain/database';
import { getNode, nodeLabel } from '../../domain/selectors';
import { ApiError, OfflineError } from '../../services/api';
import {
  AI_KEY_ERRORS,
  fetchAiModels,
  requestDatabaseProposal,
  type AiModelInfo,
  type AiModelsResponse,
} from '../../services/ai';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/*
 * Asistente de IA para el esquema de base de datos (`docs/roadmaps/ROADMAP_IA.md`). La persona
 * describe lo que quiere, la API pide una propuesta al proveedor con sus propias claves y aquí se
 * revisa operación a operación con las reglas del editor (`aiProposal.ts`) antes de aplicarla en un
 * solo paso deshacible. Nada se aplica sin que la persona lo marque.
 */

const PROVIDERS: Record<AiModelInfo['provider'], string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const TIERS: Record<AiModelInfo['tier'], string> = {
  equilibrado: 'equilibrado',
  barato: 'más barato',
  calidad: 'máxima calidad',
};
const MAX_INSTRUCTION = 4000;

interface Pending {
  proposal: AiProposal;
  refs: AiContextRefs;
  seed: string;
  modelLabel: string;
  /** `updatedAt` del proyecto cuando se pidió: si cambia, se avisa (la revisión ya es contra el actual). */
  baseUpdatedAt: string;
}

interface Failure {
  message: string;
  manage: boolean;
}

function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) return { message: error.message, manage: AI_KEY_ERRORS.has(error.code) };
  if (error instanceof OfflineError)
    return { message: 'No se ha podido conectar con Nodaria. Revisa tu conexión.', manage: false };
  return { message: 'No se ha podido pedir la propuesta.', manage: false };
}

export function AiAssistantDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { status, getToken, signIn } = useAuth();
  const { selection } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const toast = useToast();

  const [catalog, setCatalog] = useState<AiModelsResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const abort = useRef<AbortController | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);

  // Cerrar el diálogo mientras se espera cancela la petición.
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (status !== 'signed-in') return;
    let live = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetchAiModels(token);
        if (live) setCatalog(response);
      } catch (error) {
        if (live) setCatalogError(failureOf(error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [status, getToken]);

  const models = catalog?.models ?? [];
  const modelKey = (m: AiModelInfo) => `${m.provider}:${m.id}`;
  const model = models.find(m => modelKey(m) === preferences.aiModel) ?? models[0];

  const selectedTable =
    selection?.kind === 'node' &&
    getNode(project, selection.id) &&
    isTableType(project, getNode(project, selection.id)!.typeId)
      ? getNode(project, selection.id)!
      : null;
  const focusId = onlySelected && selectedTable ? selectedTable.id : null;
  const { context, refs } = useMemo(
    () => databaseContext(project, focusId ? [focusId] : undefined),
    [project, focusId],
  );
  const columnCount = context.tables.reduce((sum, t) => sum + t.columns.length, 0);

  const review = useMemo(
    () => (pending ? reviewProposal(project, pending.proposal, pending.refs, selected, pending.seed) : null),
    [project, pending, selected],
  );
  const applicable = review?.operations.filter(o => o.applied).length ?? 0;

  const ask = async () => {
    if (!model || !instruction.trim()) return;
    setFailure(null);
    setWaiting(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const token = await getToken();
      if (!token) throw new ApiError(401, 'no_autenticado', 'Tienes que iniciar sesión con tu cuenta de Yosiftware.');
      const response = await requestDatabaseProposal(
        token,
        { provider: model.provider, model: model.id, instruction: instruction.trim(), context },
        controller.signal,
      );
      setPending({
        proposal: response.proposal,
        refs,
        seed: Date.now().toString(36),
        modelLabel: response.model.label,
        baseUpdatedAt: project.updatedAt,
      });
      setSelected(defaultSelection(response.proposal));
    } catch (error) {
      if (!controller.signal.aborted) setFailure(failureOf(error));
    } finally {
      if (abort.current === controller) abort.current = null;
      setWaiting(false);
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setWaiting(false);
  };

  const apply = () => {
    if (!pending || !applicable) return;
    dispatch({
      type: 'apply-ai-proposal',
      proposal: pending.proposal,
      refs: pending.refs,
      selected,
      seed: pending.seed,
    });
    toast({ message: `Aplicados ${applicable} ${applicable === 1 ? 'cambio' : 'cambios'} de la IA`, undoable: true });
    onClose();
  };

  const toggle = (index: number) =>
    setSelected(current =>
      current.includes(index) ? current.filter(i => i !== index) : [...current, index].sort((a, b) => a - b),
    );

  const manageLink = catalog && (
    <a className="ai-manage" href={catalog.manageUrl} target="_blank" rel="noreferrer">
      Tus claves de IA y su tope se gestionan en tu cuenta de Yosiftware <ExternalLink size={13} aria-hidden />
    </a>
  );

  if (status !== 'signed-in') {
    return (
      <Modal title="Asistente de IA" informational onClose={onClose}>
        <p className="muted-note">
          {status === 'unavailable'
            ? 'La cuenta de Yosiftware no está disponible ahora mismo. Inténtalo más tarde.'
            : 'El asistente usa tus propias claves de IA, guardadas en tu cuenta de Yosiftware. Inicia sesión para usarlo.'}
        </p>
        {status === 'signed-out' && (
          <p>
            <Button variant="primary" onClick={() => void signIn()}>
              Iniciar sesión
            </Button>
          </p>
        )}
      </Modal>
    );
  }

  if (pending && review) {
    const changed = project.updatedAt !== pending.baseUpdatedAt;
    return (
      <Modal
        title="Propuesta de la IA"
        wide
        submitLabel={
          applicable ? `Aplicar ${applicable} ${applicable === 1 ? 'cambio' : 'cambios'}` : 'Nada que aplicar'
        }
        submitDisabled={!applicable}
        onSubmit={apply}
        onClose={onClose}
      >
        <div className="ai-review">
          <p className="ai-summary">{pending.proposal.summary || 'Sin resumen.'}</p>
          <p className="muted-note">
            Propuesta de {pending.modelLabel}. Revisa cada cambio: solo se aplican los marcados, en un único paso que
            puedes deshacer. Los borrados salen sin marcar.
          </p>
          {changed && (
            <p className="ai-notice">
              Has cambiado el proyecto desde que pediste la propuesta: se comprueba contra lo que hay ahora.
            </p>
          )}
          {review.operations.length ? (
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
          {!!pending.proposal.advice.length && (
            <section className="ai-section">
              <h3>Recomendaciones</h3>
              <ul>
                {pending.proposal.advice.map(a => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
          {!!review.issues.length && (
            <section className="ai-section">
              <h3>Avisos que quedarían en las tablas</h3>
              <ul>
                {review.issues.map(issue => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </section>
          )}
          <p>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cambiar la petición
            </Button>
          </p>
        </div>
      </Modal>
    );
  }

  const groups = (['anthropic', 'openai'] as const)
    .map(provider => ({ provider, models: models.filter(m => m.provider === provider) }))
    .filter(g => g.models.length);

  return (
    <Modal
      title="Asistente de IA"
      wide
      submitLabel={waiting ? 'Pensando…' : 'Pedir propuesta'}
      submitDisabled={waiting || !model || !instruction.trim()}
      initialFocus={instructionRef}
      onSubmit={() => void ask()}
      onClose={onClose}
    >
      <div className="form-grid">
        <label className="field">
          ¿Qué quieres hacer con el esquema?
          <textarea
            ref={instructionRef}
            rows={5}
            maxLength={MAX_INSTRUCTION}
            value={instruction}
            disabled={waiting}
            placeholder={
              context.tables.length
                ? 'Añade las líneas de pedido con su producto, cantidad y precio.'
                : 'Una tienda con clientes, productos, pedidos y sus líneas.'
            }
            onChange={event => setInstruction(event.target.value)}
          />
          <small>
            La IA propone cambios y tú decides cuáles aplicar. {instruction.length}/{MAX_INSTRUCTION}
          </small>
        </label>
        {selectedTable && (
          <div className="field">
            Parte del esquema
            <label className="field-inline">
              <input type="radio" checked={!onlySelected} disabled={waiting} onChange={() => setOnlySelected(false)} />
              Todo el esquema
            </label>
            <label className="field-inline">
              <input type="radio" checked={onlySelected} disabled={waiting} onChange={() => setOnlySelected(true)} />
              Solo «{nodeLabel(project, selectedTable)}» (del resto, solo sus claves)
            </label>
          </div>
        )}
        <label className="field">
          Modelo
          {catalogError ? (
            <small className="ai-error">{catalogError}</small>
          ) : (
            <select
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
          )}
          <small>
            Se usa tu clave de {model ? PROVIDERS[model.provider] : 'ese proveedor'} y cuenta para su tope de gasto.
          </small>
        </label>
        <div className="ai-privacy">
          <Sparkles size={16} aria-hidden />
          <p>
            Se envía {model ? `a ${PROVIDERS[model.provider]}` : 'al proveedor'}, a través de tu cuenta de Yosiftware:
            el nombre del proyecto y {context.tables.length} {context.tables.length === 1 ? 'tabla' : 'tablas'} con{' '}
            {columnCount} {columnCount === 1 ? 'columna' : 'columnas'} (nombres, tipos, claves y descripciones). No se
            envían notas, imágenes ni el contenido de las fichas.
          </p>
        </div>
        {manageLink}
        {waiting && (
          <div className="ai-waiting" role="status">
            <span>Pidiendo la propuesta… puede tardar unos minutos.</span>
            <Button variant="ghost" onClick={cancel}>
              Cancelar la petición
            </Button>
          </div>
        )}
        {failure && (
          <p className="ai-error" role="alert">
            {failure.message}
            {failure.manage && catalog && (
              <>
                {' '}
                <a href={catalog.manageUrl} target="_blank" rel="noreferrer">
                  Gestionar mis claves de IA
                </a>
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
