import { AtSign, Eye, Pencil } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { mentionIndex, segmentNotes } from '../../domain/notes';
import { nodeLabel } from '../../domain/selectors';
import type { Node } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button } from '../common/Button';
import { OptionList } from '../common/OptionList';
import { nodeOption } from '../common/options';
import { Popover } from '../common/Popover';

/** Notas libres del nodo con menciones [[Nombre]] que enlazan a otros nodos. */
export function NotesTab({ node }: { node: Node }) {
  const { project, dispatch } = useApp();
  const { select } = useNavigation();
  const [preview, setPreview] = useState(Boolean(node.notes));
  const [mentionAnchor, setMentionAnchor] = useState<Anchor | null>(null);
  const closeMentions = useCallback(() => setMentionAnchor(null), []);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const insertMention = (id: string) => {
    const target = project.nodes.find(n => n.id === id);
    const el = textarea.current;
    if (!target) return;
    const mention = `[[${nodeLabel(project, target)}]]`;
    // Sin cursor colocado en el texto, la mención va al final en vez de al principio.
    const untouched = !el || (el.selectionStart === 0 && el.selectionEnd === 0 && node.notes.length > 0);
    const start = untouched ? node.notes.length : el.selectionStart;
    const end = untouched ? start : el.selectionEnd;
    // Un espacio delante si la mención sigue a texto sin separación.
    const prefix = start > 0 && !/\s/.test(node.notes[start - 1]) ? ' ' : '';
    const notes = node.notes.slice(0, start) + prefix + mention + node.notes.slice(end);
    dispatch({ type: 'update-notes', id: node.id, notes });
    setMentionAnchor(null);
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(start + prefix.length + mention.length, start + prefix.length + mention.length);
    }, 0);
  };

  const index = mentionIndex(project);
  const paragraphs = node.notes.split(/\n{2,}/);

  return (
    <div className="notes">
      <div className="notes-toolbar">
        <div className="segmented">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            <Pencil size={13} aria-hidden /> Editar
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            <Eye size={13} aria-hidden /> Leer
          </button>
        </div>
        {!preview && (
          <Button size="sm" variant="ghost" icon={AtSign} onClick={e => setMentionAnchor(anchorOf(e.currentTarget))}>
            Mencionar
          </Button>
        )}
      </div>
      {preview ? (
        <div className="notes-preview" onDoubleClick={() => setPreview(false)}>
          {node.notes.trim() ? (
            paragraphs.map((paragraph, i) => (
              <p key={i}>
                {segmentNotes(project, paragraph, index).map((segment, j) =>
                  segment.kind === 'text' ? (
                    <span key={j}>{segment.text}</span>
                  ) : segment.node ? (
                    <button
                      key={j}
                      type="button"
                      className="mention"
                      onClick={() => select({ kind: 'node', id: segment.node!.id }, { reveal: true })}
                    >
                      {segment.name}
                    </button>
                  ) : (
                    <span key={j} className="mention missing" title="No hay ningún nodo con este nombre">
                      {segment.name}
                    </span>
                  ),
                )}
              </p>
            ))
          ) : (
            <p className="empty-copy">
              Sin notas. Pulsa «Editar» para escribir; usa [[Nombre]] para enlazar otro nodo.
            </p>
          )}
        </div>
      ) : (
        <textarea
          ref={textarea}
          className="notes-editor"
          value={node.notes}
          placeholder="Apuntes, ideas, dudas… Escribe [[Nombre]] para enlazar con otro nodo."
          onChange={e => dispatch({ type: 'update-notes', id: node.id, notes: e.target.value })}
        />
      )}
      {mentionAnchor && (
        <Popover anchor={mentionAnchor} onClose={closeMentions} matchWidth>
          <OptionList
            title="Mencionar a"
            options={project.nodes.filter(n => n.id !== node.id).map(n => nodeOption(project, n))}
            selected={[]}
            onPick={insertMention}
            searchThreshold={0}
          />
        </Popover>
      )}
    </div>
  );
}
