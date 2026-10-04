import { ArrowDown, X } from 'lucide-react';
import { nodeLabel } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { nodeOption } from '../common/options';
import { Select } from '../common/Select';
import { getSchema } from '../../domain/selectors';

export interface PathQuery {
  from: string | null;
  to: string | null;
}

/** «¿Cómo se conecta A con B?»: elige dos nodos y muestra el camino más corto por los vínculos visibles. */
export function PathPanel({
  query,
  path,
  onChange,
  onPick,
  onClose,
}: {
  query: PathQuery;
  /** Camino calculado, `null` si no hay, `undefined` si falta elegir. */
  path: string[] | null | undefined;
  onChange: (query: PathQuery) => void;
  onPick: (nodeId: string) => void;
  onClose: () => void;
}) {
  const { project } = useApp();
  const options = project.nodes.map(n => nodeOption(project, n));
  return (
    <section className="legend-panel path-panel" aria-label="Camino entre dos nodos">
      <header>
        <h3>Camino entre dos nodos</h3>
        <IconButton icon={X} size="sm" label="Cerrar" tooltip={false} onClick={onClose} />
      </header>
      <label className="field">
        Desde
        <Select
          options={options}
          value={query.from}
          placeholder="Elige un nodo"
          compact
          onChange={from => onChange({ ...query, from })}
        />
      </label>
      <label className="field">
        Hasta
        <Select
          options={options}
          value={query.to}
          placeholder="Elige un nodo"
          compact
          onChange={to => onChange({ ...query, to })}
        />
      </label>
      {path === undefined ? (
        <p className="muted-note">Elige los dos extremos. Solo cuentan los vínculos visibles ahora en el lienzo.</p>
      ) : path === null ? (
        <p className="muted-note">
          No hay camino entre ellos con los vínculos visibles. Prueba a mostrar más tipos en la leyenda.
        </p>
      ) : (
        <>
          <p className="muted-note">
            {path.length === 1 ? 'Es el mismo nodo.' : `${path.length - 1} salto${path.length - 1 === 1 ? '' : 's'}.`}
          </p>
          <ol className="path-steps">
            {path.map((id, i) => {
              const node = project.nodes.find(n => n.id === id);
              const schema = node && getSchema(project, node.typeId);
              return (
                <li key={id}>
                  {i > 0 && <ArrowDown size={12} aria-hidden className="path-arrow" />}
                  <button type="button" className="path-step" onClick={() => onPick(id)}>
                    {schema && <TypeIcon icon={schema.icon} color={schema.color} size="sm" />}
                    {node ? nodeLabel(project, node) : id}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
