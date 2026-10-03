import { UserPlus } from 'lucide-react';
import { kinshipName, kinshipTerm, nodeGender, typeHasGender } from '../../domain/kinship';
import { getNode, getSchema, nodeLabel } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { useToast } from '../common/toasts';

interface KinshipFieldsProps {
  sourceId: string | null;
  targetId: string | null;
  kinshipId: string | null;
  neutral: boolean;
  onChange: (patch: { kinshipId?: string | null; neutral?: boolean }) => void;
}

/** Parentesco de una relación genealógica: término, nombre neutro y oferta de añadir «Género» a los tipos. */
export function KinshipFields({ sourceId, targetId, kinshipId, neutral, onChange }: KinshipFieldsProps) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const source = sourceId ? getNode(project, sourceId) : undefined;
  const target = targetId ? getNode(project, targetId) : undefined;
  const term = kinshipTerm(project, kinshipId);
  const counterpart = term ? (kinshipTerm(project, term.counterpartId) ?? term) : undefined;
  const preview =
    term && counterpart
      ? `${source ? nodeLabel(project, source) : 'Origen'} es ${kinshipName(term, nodeGender(project, source), neutral)} de ${
          target ? nodeLabel(project, target) : 'destino'
        }; ${target ? nodeLabel(project, target) : 'destino'} es ${kinshipName(counterpart, nodeGender(project, target), neutral)} de ${
          source ? nodeLabel(project, source) : 'origen'
        }.`
      : null;
  // Tipos de los dos extremos sin atributo de género: se ofrece añadirlo.
  const missing = [source, target]
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .map(n => getSchema(project, n.typeId))
    .filter(
      (s, i, all): s is NonNullable<typeof s> => Boolean(s) && all.indexOf(s) === i && !typeHasGender(project, s!.id),
    );

  const addGender = (schemaId: string, name: string) => {
    dispatch({
      type: 'add-field',
      schemaId,
      preset: { label: 'Género', key: 'genero', type: 'gender', description: 'Decide el nombre de los parentescos.' },
    });
    toast({ message: `Atributo «Género» añadido a «${name}». Rellénalo en la ficha de cada nodo.`, undoable: true });
  };

  return (
    <>
      <div className="field">
        Parentesco
        <Select
          aria-label="Parentesco"
          options={project.kinship.map(t => ({
            value: t.id,
            label: t.neutral,
            hint:
              t.masculine && t.feminine && t.masculine !== t.feminine ? `${t.masculine} / ${t.feminine}` : undefined,
          }))}
          value={kinshipId}
          placeholder="Elegir parentesco…"
          onChange={id => onChange({ kinshipId: id })}
        />
        {preview && <small>{preview}</small>}
      </div>
      <label className="check">
        <input type="checkbox" checked={neutral} onChange={e => onChange({ neutral: e.target.checked })} />
        Usar el nombre neutro <span className="field-hint">(aunque los nodos tengan género)</span>
      </label>
      {!neutral &&
        missing.map(s => (
          <div key={s.id} className="gender-offer">
            <span>«{s.name}» no tiene atributo de género, así que se usará el nombre neutro.</span>
            <Button size="sm" icon={UserPlus} onClick={() => addGender(s.id, s.name)}>
              Añadir «Género» a {s.name}
            </Button>
          </div>
        ))}
    </>
  );
}
