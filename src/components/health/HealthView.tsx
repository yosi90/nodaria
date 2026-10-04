import {
  AtSign,
  CircleCheck,
  CopyCheck,
  HeartPulse,
  Link2Off,
  ListChecks,
  Network,
  Shapes,
  BarChart3,
  Unplug,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { describeIssue } from '../../domain/cardinality';
import { analysisLinks, betweenness, bridges, degreeCentrality } from '../../domain/centrality';
import { detectCommunities } from '../../domain/communities';
import { COLORS } from '../../domain/constants';
import { worldHealth } from '../../domain/health';
import { redundancyPairs } from '../../domain/redundancy';
import { typeStats } from '../../domain/stats';
import { getSchema, nodeLabel } from '../../domain/selectors';
import type { Node } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { EmptyState } from '../common/EmptyState';
import { TypeIcon } from '../common/icons';

/** Vista «Salud»: avisos sobre lo que suele quedar a medias en un mundo, con salto a cada nodo o tipo. */
export function HealthView() {
  const { project } = useApp();
  const { select, setView } = useNavigation();
  const report = useMemo(() => worldHealth(project), [project]);
  const graph = useMemo(() => {
    const links = analysisLinks(project);
    const score = betweenness(links);
    const degree = degreeCentrality(links);
    const byId = new Map(project.nodes.map(n => [n.id, n]));
    const central = [...score.entries()]
      .filter(([, value]) => value > 0)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([id, value]) => ({ node: byId.get(id)!, score: value, degree: degree.get(id) ?? 0 }))
      .filter(c => c.node);
    const found = bridges(links);
    return {
      central,
      bridgeNodes: found.nodes.map(id => byId.get(id)!).filter(Boolean),
      bridgeLinks: found.links
        .map(l => ({ a: byId.get(l.a)!, b: byId.get(l.b)! }))
        .filter(l => l.a && l.b)
        .slice(0, 20),
    };
  }, [project]);
  const { central, bridgeNodes, bridgeLinks } = graph;
  const redundancies = useMemo(() => redundancyPairs(project).slice(0, 20), [project]);
  const stats = useMemo(() => typeStats(project), [project]);
  const communities = useMemo(() => {
    const byId = new Map(project.nodes.map(n => [n.id, n]));
    const links = analysisLinks(project);
    const degree = degreeCentrality(links);
    return detectCommunities(links)
      .filter(c => c.members.length > 1)
      .map(c => ({
        ...c,
        color: COLORS[c.index % COLORS.length],
        nodes: c.members
          .map(id => byId.get(id)!)
          .filter(Boolean)
          .sort((x, y) => (degree.get(y.id) ?? 0) - (degree.get(x.id) ?? 0)),
      }));
  }, [project]);

  const goTo = (node: Node) => select({ kind: 'node', id: node.id }, { reveal: true });
  const NodeButton = ({ node, children }: { node: Node; children?: ReactNode }) => {
    const schema = getSchema(project, node.typeId);
    return (
      <button type="button" className="health-item" onClick={() => goTo(node)}>
        {schema && <TypeIcon icon={schema.icon} color={schema.color} size="sm" />}
        <strong>{nodeLabel(project, node)}</strong>
        {children && <span className="health-detail">{children}</span>}
      </button>
    );
  };

  if (!project.nodes.length && !project.schemas.length) {
    return (
      <main className="health-layout">
        <EmptyState icon={HeartPulse} title="Nada que revisar todavía">
          Cuando el mundo tenga tipos y nodos, aquí verás qué falta por conectar, rellenar o corregir.
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="health-layout">
      <header className="health-summary">
        <HeartPulse size={22} aria-hidden />
        <div>
          <h2>Salud del mundo</h2>
          <p className="muted-note">
            {report.total === 0
              ? 'Sin avisos: todo conectado, completo y coherente.'
              : `${report.total} aviso${report.total === 1 ? '' : 's'} en ${project.nodes.length} nodos y ${project.relations.length} relaciones. Son sugerencias, no errores.`}
          </p>
        </div>
      </header>
      <div className="health-grid">
        <Section
          icon={Unplug}
          title="Nodos sin conexiones"
          count={report.isolated.length}
          hint="Sin relaciones, ni jerarquía, ni referencias, ni menciones. ¿Falta algo o sobran?"
        >
          {report.isolated.map(n => (
            <NodeButton key={n.id} node={n} />
          ))}
        </Section>
        <Section
          icon={ListChecks}
          title="Fichas incompletas"
          count={report.incomplete.length}
          hint="Atributos obligatorios sin rellenar."
        >
          {report.incomplete.map(s => (
            <NodeButton key={s.node.id} node={s.node}>
              Falta {s.missing.map(f => f.label).join(', ')}
            </NodeButton>
          ))}
        </Section>
        <Section
          icon={Shapes}
          title="Tipos sin instancias"
          count={report.unusedTypes.length}
          hint="Tipos definidos que ningún nodo o relación usa todavía."
        >
          {report.unusedTypes.map(s => (
            <button
              key={s.id}
              type="button"
              className="health-item"
              onClick={() => setView(s.kind === 'entity' ? 'schema' : 'relations')}
            >
              <TypeIcon icon={s.icon} color={s.color} size="sm" />
              <strong>{s.name}</strong>
              <span className="health-detail">{s.kind === 'entity' ? 'Tipo de entidad' : 'Tipo de relación'}</span>
            </button>
          ))}
        </Section>
        <Section
          icon={Link2Off}
          title="Límites de relación superados"
          count={report.cardinality.length}
          hint="Más relaciones de un tipo de las que admite su límite por nodo."
        >
          {report.cardinality.map(issue => (
            <NodeButton key={`${issue.node.id}-${issue.schema.id}-${issue.end}`} node={issue.node}>
              {describeIssue(project, issue).replace(`${nodeLabel(project, issue.node)} `, '')}
            </NodeButton>
          ))}
        </Section>
        <Section
          icon={Link2Off}
          title="Referencias rotas"
          count={report.brokenReferences.length}
          hint="Atributos de referencia que apuntan a un nodo inexistente o de un tipo no admitido."
        >
          {report.brokenReferences.map(b => (
            <NodeButton key={`${b.node.id}-${b.field.id}-${b.targetId}`} node={b.node}>
              {b.field.label}:{' '}
              {b.reason === 'missing'
                ? 'apunta a un nodo que ya no existe'
                : `apunta a «${nodeLabel(
                    project,
                    project.nodes.find(n => n.id === b.targetId)!,
                  )}», de un tipo no admitido`}
            </NodeButton>
          ))}
        </Section>
        <Section
          icon={AtSign}
          title="Menciones sin destino"
          count={report.unresolvedMentions.length}
          hint="[[Nombres]] en las notas que no coinciden con el título de ningún nodo."
        >
          {report.unresolvedMentions.map((m, i) => (
            <NodeButton key={`${m.node.id}-${i}`} node={m.node}>
              [[{m.name}]]
            </NodeButton>
          ))}
        </Section>
      </div>
      <header className="health-summary health-summary-secondary">
        <Network size={22} aria-hidden />
        <div>
          <h2>Estructura del grafo</h2>
          <p className="muted-note">
            Quién concentra las conexiones y quién mantiene unido el mundo. Cuenta relaciones, jerarquía y referencias.
          </p>
        </div>
      </header>
      <div className="health-grid">
        <Section
          icon={Network}
          title="Más centrales"
          count={central.length}
          hint="Por intermediación: nodos por los que pasan más caminos entre otros. El lienzo puede dimensionarlos («Tamaño por centralidad»)."
          neutral
        >
          {central.map(c => (
            <NodeButton key={c.node.id} node={c.node}>
              {c.degree} conexiones · intermediación {Math.round(c.score)}
            </NodeButton>
          ))}
        </Section>
        <Section
          icon={Users}
          title="Comunidades"
          count={communities.length}
          hint="Grupos de nodos más conectados entre sí que con el resto (Louvain). El lienzo puede colorearlos («Color por comunidad»)."
          neutral
        >
          {communities.map(c => (
            <div key={c.index} className="health-community">
              <span className="health-community-head">
                <span className="map-cluster-swatch" style={{ background: c.color }} />
                <strong>Comunidad {c.index + 1}</strong>
                <span className="muted">{c.members.length} nodos</span>
              </span>
              <span className="health-community-members">
                {c.nodes.slice(0, 6).map(n => (
                  <button key={n.id} type="button" className="health-chip" onClick={() => goTo(n)}>
                    {nodeLabel(project, n)}
                  </button>
                ))}
                {c.nodes.length > 6 && <span className="muted">y {c.nodes.length - 6} más</span>}
              </span>
            </div>
          ))}
        </Section>
        <Section
          icon={CopyCheck}
          title="Posibles redundancias"
          count={redundancies.length}
          hint="Parejas del mismo tipo que coinciden en casi todos sus atributos y vecinos: ¿son el mismo nodo repetido o dos que ocupan el mismo hueco?"
          neutral
        >
          {redundancies.map(r => (
            <div key={`${r.a.id}-${r.b.id}`} className="health-pair">
              <NodeButton node={r.a} />
              <NodeButton node={r.b}>
                {Math.round(r.score * 100)}% parecidos: {r.sharedFields.length} atributo
                {r.sharedFields.length === 1 ? '' : 's'} igual{r.sharedFields.length === 1 ? '' : 'es'}
                {r.differingFields.length
                  ? ` (difieren en ${r.differingFields.map(f => f.label).join(', ')})`
                  : ''}, {r.sharedNeighbours} de {r.totalNeighbours} vecinos en común
              </NodeButton>
            </div>
          ))}
        </Section>
        <Section
          icon={Unplug}
          title="Puentes"
          count={bridgeNodes.length + bridgeLinks.length}
          hint="Nodos y vínculos que, si desaparecieran, dejarían partes del mundo sin conexión entre sí."
          neutral
        >
          {bridgeNodes.map(n => (
            <NodeButton key={n.id} node={n}>
              Nodo puente
            </NodeButton>
          ))}
          {bridgeLinks.map(l => (
            <NodeButton key={`${l.a.id}-${l.b.id}`} node={l.a}>
              Vínculo puente con {nodeLabel(project, l.b)}
            </NodeButton>
          ))}
        </Section>
      </div>
      {stats.length > 0 && (
        <>
          <header className="health-summary health-summary-secondary">
            <BarChart3 size={22} aria-hidden />
            <div>
              <h2>Estadísticas por tipo</h2>
              <p className="muted-note">
                Cuántos nodos hay de cada tipo, cuántas relaciones tienen de media y cómo se reparten sus listas.
              </p>
            </div>
          </header>
          <div className="health-grid">
            {stats.map(t => (
              <section key={t.schema.id} className="card health-card">
                <div className="card-head">
                  <h3>
                    <TypeIcon icon={t.schema.icon} color={t.schema.color} size="sm" /> {t.schema.name}
                  </h3>
                  <span className="health-count">{t.nodes}</span>
                </div>
                <p className="muted-note">
                  {t.averageRelations.toFixed(1)} relaciones por nodo de media
                  {t.withoutRelations ? `; ${t.withoutRelations} sin ninguna` : ''}.
                </p>
                {t.distributions.map(d => {
                  const max = Math.max(1, ...d.values.map(v => v.count));
                  return (
                    <div key={d.field.id} className="stat-field">
                      <div className="stat-field-head">
                        <strong>{d.field.label}</strong>
                        {d.empty > 0 && <span className="muted">{d.empty} sin valor</span>}
                      </div>
                      {d.values.slice(0, 8).map(v => (
                        <div key={v.value} className="stat-bar" title={`${v.value}: ${v.count}`}>
                          <span className="stat-bar-label">{v.value}</span>
                          <span className="stat-bar-track">
                            <span
                              className="stat-bar-fill"
                              style={{ width: `${(v.count / max) * 100}%`, background: t.schema.color }}
                            />
                          </span>
                          <span className="stat-bar-count">{v.count}</span>
                        </div>
                      ))}
                      {d.values.length > 8 && <span className="muted">y {d.values.length - 8} valores más</span>}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  hint,
  neutral,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  hint: string;
  /** Información, no aviso: el contador no se pinta como advertencia. */
  neutral?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`card health-card ${count || neutral ? '' : 'ok'}`}>
      <div className="card-head">
        <h3>
          <Icon size={16} aria-hidden /> {title}
        </h3>
        <span className={`health-count ${count && !neutral ? 'warn' : ''}`}>
          {count ? count : <CircleCheck size={16} aria-hidden />}
        </span>
      </div>
      <p className="muted-note">{hint}</p>
      {count > 0 && <div className="health-list">{children}</div>}
    </section>
  );
}
