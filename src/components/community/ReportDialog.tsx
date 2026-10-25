import { useState } from 'react';
import { ApiError } from '../../services/api';
import { REPORT_REASONS, reportPublic, type ReportReason } from '../../services/community';
import { useAuth } from '../../state/auth';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';
import { ErrorNote } from '../common/ErrorNote';

/**
 * Denunciar un proyecto público: es contenido de Nodaria, así que la denuncia es suya y la atiende el
 * propietario desde Notificapp (`ecosistema-kit/MODERACION.md`). Nadie sabe quién denunció.
 */
export function ReportDialog({ publicId, name, onClose }: { publicId: string; name: string; onClose: () => void }) {
  const { getToken } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new ApiError(401, 'no_autenticado', 'Entra con tu cuenta para denunciar.');
      await reportPublic(token, publicId, reason, text.trim());
      toast({ message: 'Denuncia enviada. La revisaremos; nadie sabrá que has sido tú.' });
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'denuncia_repetida'
          ? 'Ya has denunciado este proyecto. La revisaremos.'
          : failure instanceof Error
            ? failure.message
            : 'No se ha podido enviar la denuncia.',
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Denunciar el proyecto"
      submitLabel={busy ? 'Enviando…' : 'Enviar la denuncia'}
      submitDisabled={busy || !reason}
      tone="danger"
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <div className="form-grid">
        <p className="muted-note">¿Qué ocurre con «{name}»? Lo revisará el equipo de Yosiftware.</p>
        <fieldset className="report-reasons">
          <legend>Motivo</legend>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map(key => (
            <label key={key} className="field-inline">
              <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} />
              {REPORT_REASONS[key]}
            </label>
          ))}
        </fieldset>
        <label className="field">
          Detalles (opcional)
          <textarea value={text} maxLength={500} rows={3} onChange={e => setText(e.target.value)} />
        </label>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
