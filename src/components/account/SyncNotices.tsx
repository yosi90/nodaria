import { useEffect } from 'react';
import { useSync } from '../../state/sync';
import { useToast } from '../common/toasts';

/** Convierte los avisos de «último cambio gana» en toasts. */
export function SyncNotices() {
  const { conflicts, dismissConflicts } = useSync();
  const toast = useToast();
  useEffect(() => {
    if (!conflicts.length) return;
    for (const conflict of conflicts) {
      toast({
        message:
          conflict.winner === 'remote'
            ? `«${conflict.name}» se ha actualizado con la versión más reciente, hecha en otro dispositivo.`
            : `«${conflict.name}» también cambió en otro dispositivo; se ha conservado la versión de aquí, más reciente.`,
        duration: 9000,
      });
    }
    dismissConflicts();
  }, [conflicts, dismissConflicts, toast]);
  return null;
}
