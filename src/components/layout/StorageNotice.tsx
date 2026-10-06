import { CircleAlert, Download, RotateCw, X } from 'lucide-react';
import { useState } from 'react';
import { downloadProject, downloadText } from '../../services/files';
import { useApp } from '../../state/AppContext';
import { useSync } from '../../state/sync';
import { Button } from '../common/Button';
import { useDialogs } from '../common/dialogs';

/** Avisa de lo que pone en riesgo los datos del navegador: guardados que fallan y datos que no se pudieron abrir. */
export function StorageNotice() {
  return (
    <>
      <DamageNotice />
      <SaveFailureNotice />
    </>
  );
}

function DamageNotice() {
  const { damage, resolveDamage } = useApp();
  const { confirm } = useDialogs();
  if (!damage) return null;
  const download = () => {
    downloadText(`nodaria-datos-originales-${new Date().toISOString().slice(0, 10)}.json`, damage.raw);
    resolveDamage();
  };
  const giveUp = async () => {
    const ok = await confirm({
      title: 'Seguir sin los datos originales',
      message:
        'El próximo guardado sustituirá el texto original, y lo que no se pudo abrir se perderá en este navegador. Si estaba en tu cuenta, se recuperará de ella al sincronizar.',
      confirmLabel: 'Seguir sin ellos',
      danger: true,
    });
    if (ok) resolveDamage();
  };
  return (
    <section className="repair-banner danger" role="alert">
      <header>
        <CircleAlert size={18} aria-hidden />
        <h2>Hay datos guardados que no se han podido abrir</h2>
      </header>
      <ul>
        {damage.lost.map((name, i) => (
          <li key={i}>{name}</li>
        ))}
      </ul>
      <p>
        {damage.rescued
          ? 'Antes de seguir se ha apartado una copia del texto original en este navegador: no se ha borrado nada.'
          : 'No había espacio para apartar una copia del texto original, así que no se guardará nada en este navegador hasta que lo descargues o decidas seguir sin él.'}{' '}
        Si esos proyectos estaban en tu cuenta, se recuperan de ella al sincronizar.
      </p>
      <div className="notice-actions">
        <Button size="sm" variant="primary" icon={Download} onClick={download}>
          Descargar los datos originales
        </Button>
        {damage.rescued ? (
          <Button size="sm" onClick={resolveDamage}>
            Entendido
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={giveUp}>
            Seguir sin ellos
          </Button>
        )}
      </div>
    </section>
  );
}

function SaveFailureNotice() {
  const { saveFailure, retrySave, project } = useApp();
  const sync = useSync();
  const [hidden, setHidden] = useState(false);
  // Tras un guardado correcto, el siguiente fallo vuelve a avisar.
  const [seen, setSeen] = useState(saveFailure);
  if (seen !== saveFailure) {
    setSeen(saveFailure);
    if (!saveFailure) setHidden(false);
  }
  if (!saveFailure || hidden) return null;
  const accountReceives = sync.state === 'idle' || sync.state === 'syncing';
  return (
    <section className="repair-banner danger" role="alert">
      <header>
        <CircleAlert size={18} aria-hidden />
        <h2>No se pueden guardar los cambios en este navegador</h2>
        <button className="icon-btn sm" aria-label="Ocultar aviso" onClick={() => setHidden(true)}>
          <X size={15} aria-hidden />
        </button>
      </header>
      <p>
        {saveFailure === 'quota'
          ? 'El almacenamiento del navegador está lleno: son unos 5 MB para todos los proyectos, y las imágenes son lo que más ocupa.'
          : 'El navegador no deja guardar datos (pasa en algunas ventanas privadas o con el almacenamiento bloqueado).'}
      </p>
      <p>
        {accountReceives
          ? 'Tu cuenta sí está recibiendo los cambios. Aun así, exporta el proyecto si quieres una copia en este equipo.'
          : 'Los cambios siguen en esta pestaña. Antes de cerrarla, exporta el proyecto o inicia sesión para guardarlo en tu cuenta.'}
      </p>
      <div className="notice-actions">
        <Button size="sm" variant="primary" icon={Download} onClick={() => downloadProject(project)}>
          Exportar «{project.name}»
        </Button>
        <Button size="sm" icon={RotateCw} onClick={retrySave}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
