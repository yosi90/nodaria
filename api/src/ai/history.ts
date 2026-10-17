import type { AiTurn } from './assistant.ts';
import type { AiStoredMessage } from './conversations.ts';
import type { AiProposal } from './schema.ts';

/*
 * Lo que el modelo recuerda de la conversación: las peticiones anteriores y un resumen de lo que
 * propuso y de lo que la persona aplicó, o la respuesta que dio a una pregunta. No hace falta reenviar las propuestas enteras: el esquema
 * actual ya va en cada petición. Solo los últimos turnos completos (petición y respuesta) y con un
 * tope de texto, para acotar el coste.
 */

export const HISTORY_TURNS = 6;
const MAX_TURN_TEXT = 4000;

const clip = (text: string) => (text.length > MAX_TURN_TEXT ? `${text.slice(0, MAX_TURN_TEXT)}…` : text);

function describeOperation(o: AiProposal['operations'][number]) {
  switch (o.op) {
    case 'create-table':
      return `crear la tabla ${o.name} (${o.ref})`;
    case 'rename-table':
      return `renombrar ${o.table} a ${o.name}`;
    case 'delete-table':
      return `quitar ${o.table}`;
    case 'add-column':
      return `añadir ${o.table}.${o.column.name}`;
    case 'update-column':
      return `cambiar ${o.table}.${o.column}`;
    case 'rename-column':
      return `renombrar ${o.table}.${o.column} a ${o.name}`;
    case 'delete-column':
      return `quitar ${o.table}.${o.column}`;
    case 'add-foreign-key':
      return `FK ${o.table}.${o.column} → ${o.references}`;
  }
}

function assistantText(content: Record<string, unknown>) {
  // Una respuesta a una pregunta se recuerda tal cual (recortada): no hay nada aplicado que contar.
  const answer = content.answer as { answer?: unknown } | undefined;
  if (answer && typeof answer.answer === 'string') return clip(answer.answer);
  const proposal = content.proposal as AiProposal | undefined;
  if (!proposal) return null;
  const applied = Array.isArray(content.applied) ? (content.applied as number[]) : null;
  const ops = proposal.operations.map((o, i) => `${i + 1}. ${describeOperation(o)}`).join('; ');
  const outcome =
    applied === null
      ? 'La persona no la ha aplicado.'
      : applied.length
        ? `La persona aplicó las operaciones ${applied.map(i => i + 1).join(', ')}; el esquema actual ya las incluye.`
        : 'La persona la descartó.';
  return clip(`Propuse: ${proposal.summary}\nOperaciones: ${ops || 'ninguna'}\n${outcome}`);
}

/** Turnos completos anteriores a la petición nueva, en orden, para mandárselos al modelo. */
export function conversationTurns(messages: AiStoredMessage[]): AiTurn[] {
  const turns: AiTurn[][] = [];
  messages.forEach((message, i) => {
    if (message.role !== 'user') return;
    const next = messages[i + 1];
    const reply = next?.role === 'assistant' ? assistantText(next.content) : null;
    const instruction = typeof message.content.instruction === 'string' ? message.content.instruction : '';
    if (!reply || !instruction) return;
    turns.push([
      { role: 'user', text: clip(instruction) },
      { role: 'assistant', text: reply },
    ]);
  });
  return turns.slice(-HISTORY_TURNS).flat();
}
