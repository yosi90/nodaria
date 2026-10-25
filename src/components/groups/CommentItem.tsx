import { Check, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CommentState, GroupComment } from '../../services/comments';
import { Button, IconButton } from '../common/Button';
import { dateTimeText } from '../common/dates';

/**
 * Un comentario del grupo en una lista (`GroupPanel`, `EntryPanel`): quién y cuándo, el texto y las acciones
 * de resolver, reabrir y borrar. `header` va antes del texto (a qué se refiere), `children` después (una
 * sugerencia) y `actions` delante de las demás acciones.
 */
export function CommentItem({
  comment,
  author,
  stateLabel,
  resolvable = true,
  canChange,
  canDelete,
  busy,
  onState,
  onDelete,
  header,
  children,
  actions,
}: {
  comment: GroupComment;
  author: string;
  /** La insignia de un comentario que ya no está abierto. */
  stateLabel: string;
  /** Si se ofrece «Resolver» mientras está abierto (una sugerencia se acepta o se rechaza). */
  resolvable?: boolean;
  canChange: boolean;
  canDelete: boolean;
  busy: boolean;
  onState: (state: CommentState) => void;
  onDelete: () => void;
  header?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className={`group-comment ${comment.state}`}>
      <div className="group-comment-meta">
        <strong>{author}</strong>
        <span>{dateTimeText(comment.createdAt, 'short')}</span>
        {comment.state !== 'abierto' && <span className="badge">{stateLabel}</span>}
      </div>
      {header}
      <p className="group-comment-body">{comment.body}</p>
      {children}
      <div className="group-comment-actions">
        {actions}
        {resolvable && comment.state === 'abierto' && canChange && (
          <Button size="sm" variant="ghost" icon={Check} disabled={busy} onClick={() => onState('resuelto')}>
            Resolver
          </Button>
        )}
        {comment.state === 'resuelto' && canChange && (
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy} onClick={() => onState('abierto')}>
            Reabrir
          </Button>
        )}
        {canDelete && (
          <IconButton icon={Trash2} size="sm" label="Borrar el comentario" disabled={busy} onClick={onDelete} />
        )}
      </div>
    </li>
  );
}
