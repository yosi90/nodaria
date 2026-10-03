import { useApp } from '../../state/AppContext';

/** Informa de las correcciones automáticas aplicadas a datos guardados o importados. */
export function RepairNotice() {
  const { repairs, dismissRepairs } = useApp();
  if (!repairs.length) return null;
  return (
    <section className="repair-banner" role="status">
      <header>
        <h2>Se han reparado datos dañados</h2>
        <button className="icon-btn" aria-label="Cerrar aviso" onClick={dismissRepairs}>
          ×
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
      <button className="btn" onClick={dismissRepairs}>
        Entendido
      </button>
    </section>
  );
}
