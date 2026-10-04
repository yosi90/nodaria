import { GitFork, Library, Moon, Network, Plus, Search, Shapes, Sun, type LucideIcon, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { uid } from '../../domain/factories';
import { allFields, getSchema, nodeLabel } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import { TypeIcon } from '../common/icons';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Nodos' | 'Relaciones' | 'Tipos' | 'Acciones';
  leading: ReactNode;
  keywords: string;
  run: () => void;
}

const normalize = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const MAX_RESULTS = 40;

/** Buscador global (Ctrl+K): salta a cualquier nodo, relación o tipo, o ejecuta una acción. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { select, setView } = useNavigation();
  const { preferences, setPreference } = usePreferences();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => input.current?.focus(), []);

  const commands = useMemo<Command[]>(() => {
    const icon = (Icon: LucideIcon) => <Icon size={15} aria-hidden />;
    const nodes: Command[] = project.nodes.map(n => {
      const schema = getSchema(project, n.typeId);
      const values = allFields(project, n.typeId)
        .filter(f => f.type !== 'image')
        .map(f => n.values[f.id])
        .filter(v => typeof v === 'string' || typeof v === 'number')
        .join(' ');
      return {
        id: `node:${n.id}`,
        label: nodeLabel(project, n),
        hint: schema?.name,
        group: 'Nodos',
        leading: <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />,
        keywords: `${values} ${n.notes}`,
        run: () => select({ kind: 'node', id: n.id }, { reveal: true }),
      };
    });
    const relations: Command[] = project.relations.map(r => {
      const schema = getSchema(project, r.typeId);
      const a = project.nodes.find(n => n.id === r.sourceId);
      const b = project.nodes.find(n => n.id === r.targetId);
      const ends = `${a ? nodeLabel(project, a) : '?'} ${schema?.directed ? '→' : '↔'} ${b ? nodeLabel(project, b) : '?'}`;
      return {
        id: `rel:${r.id}`,
        label: ends,
        hint: schema?.name,
        group: 'Relaciones',
        leading: <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />,
        keywords: Object.values(r.values).join(' '),
        run: () => select({ kind: 'relation', id: r.id }, { reveal: true }),
      };
    });
    const types: Command[] = project.schemas.map(s => ({
      id: `type:${s.id}`,
      label: s.name,
      hint: s.kind === 'entity' ? 'Tipo de entidad' : 'Tipo de relación',
      group: 'Tipos',
      leading: <TypeIcon icon={s.icon} color={s.color} size="sm" />,
      keywords: 'tipo esquema',
      run: () => {
        setView(s.kind === 'entity' ? 'schema' : 'relations');
        window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-type-id="${s.id}"]`)?.click(), 0);
      },
    }));
    const actions: Command[] = [
      ...project.schemas
        .filter(s => s.kind === 'entity' && !s.isAbstract)
        .map<Command>(s => ({
          id: `new:${s.id}`,
          label: `Nuevo ${s.name}`,
          hint: 'crear nodo',
          group: 'Acciones',
          leading: icon(Plus),
          keywords: 'crear nuevo añadir nodo',
          run: () => {
            const id = uid('node');
            dispatch({ type: 'add-node', typeId: s.id, parentId: null, id });
            select({ kind: 'node', id }, { reveal: true });
          },
        })),
      {
        id: 'view:map',
        label: 'Ir al mapa',
        group: 'Acciones',
        leading: icon(Network),
        keywords: 'vista lienzo',
        run: () => setView('map'),
      },
      {
        id: 'view:schema',
        label: 'Ir a tipos',
        group: 'Acciones',
        leading: icon(Shapes),
        keywords: 'vista esquema tipos',
        run: () => setView('schema'),
      },
      {
        id: 'view:relations',
        label: 'Ir a relaciones',
        group: 'Acciones',
        leading: icon(GitFork),
        keywords: 'vista tipos de relación',
        run: () => setView('relations'),
      },
      {
        id: 'view:properties',
        label: 'Ir a propiedades',
        group: 'Acciones',
        leading: icon(Library),
        keywords: 'vista propiedades atributos compartidos preformas biblioteca',
        run: () => setView('properties'),
      },
      {
        id: 'view:table',
        label: 'Ir a la tabla',
        group: 'Acciones',
        leading: icon(Table2),
        keywords: 'vista tabla hoja filas columnas editar muchos',
        run: () => setView('table'),
      },
      {
        id: 'theme',
        label: preferences.theme === 'dark' ? 'Tema claro' : 'Tema oscuro',
        group: 'Acciones',
        leading: icon(preferences.theme === 'dark' ? Sun : Moon),
        keywords: 'tema oscuro claro modo',
        run: () => setPreference('theme', preferences.theme === 'dark' ? 'light' : 'dark'),
      },
    ];
    return [...nodes, ...relations, ...types, ...actions];
  }, [project, select, setView, dispatch, preferences.theme, setPreference]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return commands.filter(c => c.group === 'Nodos' || c.group === 'Acciones').slice(0, MAX_RESULTS);
    const terms = q.split(/\s+/);
    const scored = commands
      .map(c => {
        const label = normalize(c.label);
        const hay = `${label} ${normalize(c.hint ?? '')} ${normalize(c.keywords)}`;
        if (!terms.every(t => hay.includes(t))) return null;
        const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
        return { c, score };
      })
      .filter((x): x is { c: Command; score: number } => Boolean(x))
      .sort((a, b) => a.score - b.score);
    return scored.map(x => x.c).slice(0, MAX_RESULTS);
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const run = (command: Command) => {
    onClose();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive(i => Math.min(results.length - 1, i + 1));
    else if (event.key === 'ArrowUp') setActive(i => Math.max(0, i - 1));
    else if (event.key === 'Enter' && results[activeIndex]) run(results[activeIndex]);
    else if (event.key === 'Escape') onClose();
    else return;
    event.preventDefault();
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Buscar"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-input">
          <Search size={16} aria-hidden />
          <input
            ref={input}
            value={query}
            placeholder="Buscar nodos, relaciones, tipos o acciones…"
            aria-label="Buscar"
            onChange={e => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div ref={list} className="palette-results" role="listbox">
          {results.map((c, i) => {
            const header = results[i - 1]?.group !== c.group ? c.group : null;
            return (
              <div key={c.id}>
                {header && <div className="menu-title">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  data-index={i}
                  className={`menu-item ${i === activeIndex ? 'active' : ''}`}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => run(c)}
                >
                  {c.leading}
                  <span className="label">{c.label}</span>
                  {c.hint && <span className="hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
          {!results.length && <div className="menu-empty">Sin resultados para «{query}».</div>}
        </div>
      </div>
    </div>
  );
}
