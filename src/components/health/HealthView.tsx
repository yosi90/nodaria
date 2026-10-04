import { AtSign, CircleCheck, HeartPulse, Link2Off, ListChecks, Shapes, Unplug, type LucideIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { describeIssue } from '../../domain/cardinality';
import { worldHealth } from '../../domain/health';
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
    </main>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className={`card health-card ${count ? '' : 'ok'}`}>
      <div className="card-head">
        <h3>
          <Icon size={16} aria-hidden /> {title}
        </h3>
        <span className={`health-count ${count ? 'warn' : ''}`}>
          {count ? count : <CircleCheck size={16} aria-hidden />}
        </span>
      </div>
      <p className="muted-note">{hint}</p>
      {count > 0 && <div className="health-list">{children}</div>}
    </section>
  );
}
