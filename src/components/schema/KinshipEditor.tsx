import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { uid } from '../../domain/factories';
import { defaultKinship, kinshipIssues } from '../../domain/kinship';
import type { KinshipTerm } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Select } from '../common/Select';

const GENERATIONS: [number, string][] = [
  [3, 'Bisabuelos (+3)'],
  [2, 'Abuelos (+2)'],
  [1, 'Ascendiente (+1)'],
  [0, 'Misma generación'],
  [-1, 'Descendiente (−1)'],
  [-2, 'Nietos (−2)'],
  [-3, 'Bisnietos (−3)'],
];

/** Vocabulario de parentesco del proyecto: términos con género, contraparte y generación. */
export function KinshipEditor() {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const terms = project.kinship;
  const issues = kinshipIssues(terms);
  const set = (next: KinshipTerm[]) => dispatch({ type: 'update-kinship', kinship: next });
  const update = (id: string, patch: Partial<KinshipTerm>) =>
    set(terms.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const add = () => {
    const id = uid('kin');
    set([
      ...terms,
      {
        id,
        neutral: 'Nuevo parentesco',
        masculine: '',
        feminine: '',
        counterpartId: id,
        generation: 0,
        lineage: false,
      },
    ]);
  };
  const remove = async (t: KinshipTerm) => {
    const used = project.relations.filter(r => r.kinshipId === t.id).length;
    if (used) {
      const ok = await confirm({
        title: `Eliminar «${t.neutral}»`,
        message: `${used} ${used === 1 ? 'relación lo usa y quedará' : 'relaciones lo usan y quedarán'} sin parentesco.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
    }
    set(terms.filter(x => x.id !== t.id));
  };
  const reset = async () => {
    const ok = await confirm({
      title: 'Restablecer el vocabulario',
      message:
        'Se sustituirá por la lista inicial. Las relaciones que usen términos que no existan en ella quedarán sin parentesco.',
      confirmLabel: 'Restablecer',
      danger: true,
    });
    if (ok) set(defaultKinship());
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Vocabulario de parentesco</h3>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>
          Restablecer
        </Button>
        <Button size="sm" icon={Plus} onClick={add}>
          Término
        </Button>
      </div>
      <p className="muted-note" style={{ marginBottom: 'var(--space-3)' }}>
        Compartido por todas las relaciones genealógicas del proyecto. Cada término describe al origen respecto al
        destino; su contraparte describe al destino. El nombre se elige según el género del nodo (o el neutro).
      </p>
      {issues.length > 0 && (
        <ul className="impact-list" style={{ color: 'var(--warning)', marginBottom: 'var(--space-3)' }}>
          {issues.map(i => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="kinship-table">
        <div className="kinship-head">
          <span>Neutro</span>
          <span>Masculino</span>
          <span>Femenino</span>
          <span>Contraparte</span>
          <span>Generación</span>
          <span title="Ascendencia directa: forma el árbol genealógico">Árbol</span>
          <span />
        </div>
        {terms.map(t => (
          <div key={t.id} className="kinship-row">
            <input
              value={t.neutral}
              aria-label="Nombre neutro"
              onChange={e => update(t.id, { neutral: e.target.value })}
            />
            <input
              value={t.masculine}
              aria-label="Nombre masculino"
              placeholder={t.neutral}
              onChange={e => update(t.id, { masculine: e.target.value })}
            />
            <input
              value={t.feminine}
              aria-label="Nombre femenino"
              placeholder={t.neutral}
              onChange={e => update(t.id, { feminine: e.target.value })}
            />
            <Select
              compact
              aria-label="Contraparte"
              options={terms.map(x => ({ value: x.id, label: x.neutral }))}
              value={t.counterpartId}
              onChange={id => id && update(t.id, { counterpartId: id })}
            />
            <Select
              compact
              aria-label="Generación"
              options={GENERATIONS.map(([g, label]) => ({ value: String(g), label }))}
              value={String(t.generation)}
              onChange={g =>
                g !== null && update(t.id, { generation: Number(g), lineage: t.lineage && Math.abs(Number(g)) === 1 })
              }
            />
            <input
              type="checkbox"
              aria-label="Forma el árbol genealógico"
              checked={t.lineage}
              disabled={Math.abs(t.generation) !== 1}
              title={Math.abs(t.generation) !== 1 ? 'Solo los términos de ascendencia directa (±1)' : undefined}
              onChange={e => update(t.id, { lineage: e.target.checked })}
            />
            <IconButton
              icon={Trash2}
              size="sm"
              variant="danger"
              label={`Eliminar ${t.neutral}`}
              tooltip={false}
              onClick={() => void remove(t)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
