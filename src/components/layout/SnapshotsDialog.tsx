import { useEffect, useMemo, useState } from 'react';
import { uid } from '../../domain/factories';
import { listSnapshots, loadSnapshot, type SnapshotSummary } from '../../services/storage';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';
import { dateTimeText } from '../common/dates';

/**
 * Copias automáticas del navegador (PENDIENTES.md, Fase 7): la versión anterior a los cambios de cada
 * proyecto, como mucho cada media hora, las 12 últimas y de los últimos 30 días. Se restauran como un
 * proyecto nuevo, sin tocar el actual, así que también recuperan proyectos borrados.
 */
export function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch, reportRepairs } = useApp();
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    listSnapshots().then(setSnapshots, () => setFailed(true));
  }, []);

  // Agrupadas por proyecto: primero los que siguen existiendo, en el orden de la lista.
  const groups = useMemo(() => {
    const byProject = new Map<string, SnapshotSummary[]>();
    for (const s of snapshots ?? []) byProject.set(s.projectId, [...(byProject.get(s.projectId) ?? []), s]);
    const order = state.projects.map(p => p.id);
    return [...byProject.entries()].sort(
      ([a], [b]) => (order.indexOf(a) + 1 || order.length + 1) - (order.indexOf(b) + 1 || order.length + 1),
    );
  }, [snapshots, state.projects]);

  const restore = async (snapshot: SnapshotSummary) => {
    const loaded = await loadSnapshot(snapshot.key);
    if (!loaded) {
      toast({ message: 'No se ha podido leer esa copia.' });
      return;
    }
    const name = `${loaded.project.name} (copia del ${dateTimeText(snapshot.savedAt)})`;
    dispatch({ type: 'import-project', project: { ...loaded.project, id: uid('project'), name } });
    if (loaded.issues.length) reportRepairs({ projectName: name, issues: loaded.issues });
    toast({ message: `Restaurada como «${name}».` });
    onClose();
  };

  return (
    <Modal title="Copias de seguridad" informational wide onClose={onClose}>
      <p className="muted-note">
        Mientras trabajas, este navegador guarda la versión anterior de cada proyecto que cambias, como mucho cada media
        hora: las 12 últimas de cada uno, durante 30 días. Restaurar una copia crea un proyecto nuevo y no toca el
        actual, así que también sirve para recuperar un proyecto borrado. Son de este navegador: no se sincronizan.
      </p>
      {failed ? (
        <p className="muted-note">No se han podido leer las copias de este navegador.</p>
      ) : snapshots === null ? (
        <p className="muted-note">Cargando…</p>
      ) : !snapshots.length ? (
        <p className="muted-note">Todavía no hay copias: se guardan a medida que cambias tus proyectos.</p>
      ) : (
        <div className="snapshot-groups">
          {groups.map(([projectId, list]) => {
            const current = state.projects.find(p => p.id === projectId);
            return (
              <section key={projectId} aria-label={list[0].name}>
                <h3 className="snapshot-title">
                  {current?.name ?? list[0].name}
                  {!current && <span className="badge warning">borrado</span>}
                </h3>
                <ul className="snapshot-list">
                  {list.map(snapshot => (
                    <li key={snapshot.key}>
                      <span>{dateTimeText(snapshot.savedAt)}</span>
                      <span className="field-hint">
                        {snapshot.nodes} nodos · {snapshot.relations} relaciones
                      </span>
                      <Button size="sm" onClick={() => void restore(snapshot)}>
                        Restaurar como proyecto nuevo
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
