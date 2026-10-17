import { CalendarRange, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { compareDates, formatDate, monthName, todayOf } from '../../domain/calendar';
import { getNode, getSchema } from '../../domain/selectors';
import { groupByYear, timelineEvents, type TimelineEvent } from '../../domain/timeline';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';
import { NodeAvatar } from '../common/NodeAvatar';

/**
 * Vista «Cronología»: las fechas de nodos y relaciones en orden, por años, con el calendario del mundo
 * (`src/domain/timeline.ts`). Marca la fecha actual del mundo y avisa de las fechas que no existen en el
 * calendario. Cada acontecimiento lleva a su nodo o relación en el mapa.
 */
export function TimelineView() {
  const { project } = useApp();
  const { select } = useNavigation();
  const all = useMemo(() => timelineEvents(project), [project]);
  const [typeId, setTypeId] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const types = useMemo(
    () => [...new Set(all.map(e => e.typeId))].map(id => getSchema(project, id)).filter(s => s !== undefined),
    [all, project],
  );
  // Por etiqueta: «Nacimiento» de varios tipos (cada uno con su atributo) se filtra de una vez.
  const labels = useMemo(
    () => [...new Set(all.map(e => e.fieldLabel))].sort((a, b) => a.localeCompare(b, 'es')),
    [all],
  );
  const events = all.filter(e => (!typeId || e.typeId === typeId) && (!fieldLabel || e.fieldLabel === fieldLabel));
  const years = groupByYear(events);
  const today = todayOf(project.calendar);
  // El marcador de hoy va antes del primer acontecimiento posterior a hoy.
  const nextKey = events.find(e => compareDates(e.date, today) > 0)?.key;
  const invalid = events.filter(e => !e.valid).length;

  const open = (event: TimelineEvent) => select(event.owner, { reveal: true });

  if (!all.length) {
    return (
      <main className="health-layout timeline-layout">
        <EmptyState icon={CalendarRange} title="Sin fechas todavía">
          Añade a un tipo un atributo de tipo «Fecha» (nacimiento, fundación, batalla…) y rellénalo: cada fecha aparece
          aquí en orden, con el calendario del proyecto.
        </EmptyState>
      </main>
    );
  }

  const todayRow = (
    <li className="timeline-today" key="today">
      <span>Hoy en el mundo · {formatDate(project.calendar, today)}</span>
    </li>
  );

  return (
    <main className="health-layout timeline-layout">
      <header className="health-summary">
        <CalendarRange size={22} aria-hidden />
        <div>
          <h2>Cronología</h2>
          <p className="muted-note">
            {events.length === 1 ? '1 fecha' : `${events.length} fechas`} de nodos y relaciones, con el calendario del
            proyecto.
            {invalid > 0 &&
              ` ${invalid === 1 ? '1 no existe' : `${invalid} no existen`} en el calendario y se marcan para corregirlas.`}
          </p>
        </div>
        <div className="timeline-filters">
          <label className="field">
            Tipo
            <select value={typeId} onChange={e => setTypeId(e.target.value)}>
              <option value="">Todos</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Fecha
            <select value={fieldLabel} onChange={e => setFieldLabel(e.target.value)}>
              <option value="">Todas</option>
              {labels.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {!events.length ? (
        <p className="muted-note timeline-empty">Ninguna fecha con estos filtros.</p>
      ) : (
        <ol className="timeline">
          {years.map(group => [
            // Si hoy cae entre dos años, el marcador va antes del año siguiente, no dentro de él.
            group.events[0].key === nextKey && todayRow,
            <li key={group.year} className="timeline-year">
              {group.gap > 0 && (
                <p className="timeline-gap">{group.gap === 1 ? '1 año sin fechas' : `${group.gap} años sin fechas`}</p>
              )}
              <h3>{group.year}</h3>
              <ol>
                {group.events.map(event => {
                  const node = event.owner.kind === 'node' ? getNode(project, event.owner.id) : undefined;
                  const schema = getSchema(project, event.typeId);
                  return [
                    event.key === nextKey && event !== group.events[0] && todayRow,
                    <li key={event.key}>
                      <button type="button" className="timeline-event" onClick={() => open(event)}>
                        <span className="timeline-date">
                          {event.date.day} {monthName(project.calendar, event.date.month)}
                        </span>
                        <span className="timeline-dot" style={{ background: schema?.color }} aria-hidden />
                        {node ? (
                          <NodeAvatar project={project} node={node} size="sm" />
                        ) : (
                          schema && <TypeIcon icon={schema.icon} color={schema.color} size="sm" />
                        )}
                        <strong>{event.label}</strong>
                        <span className="chip">{event.fieldLabel}</span>
                        {event.owner.kind === 'relation' && schema && (
                          <span className="timeline-kind">{schema.name}</span>
                        )}
                        {!event.valid && (
                          <span className="timeline-invalid" title="Esta fecha no existe en el calendario del proyecto">
                            <TriangleAlert size={13} aria-hidden /> No existe en el calendario
                          </span>
                        )}
                      </button>
                    </li>,
                  ];
                })}
              </ol>
            </li>,
          ])}
          {!nextKey && todayRow}
        </ol>
      )}
    </main>
  );
}
