import { TriangleAlert, X } from 'lucide-react';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';

/** Informa de las correcciones automáticas aplicadas a datos guardados o importados. */
export function RepairNotice() {
  const { repairs, dismissRepairs } = useApp();
  if (!repairs.length) return null;
  return (
    <section className="repair-banner" role="status">
      <header>
        <TriangleAlert size={18} aria-hidden />
        <h2>Se han reparado datos dañados</h2>
        <button className="icon-btn sm" aria-label="Cerrar aviso" onClick={dismissRepairs}>
          <X size={15} aria-hidden />
        </button>
      </header>
      {repairs.map((entry, index) => (
        <div key={index}>
          <strong>{entry.projectName}</strong>
          <ul>
            {entry.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      ))}
      <Button size="sm" onClick={dismissRepairs}>
        Entendido
      </Button>
    </section>
  );
}
