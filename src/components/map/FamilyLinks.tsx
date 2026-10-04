import { ViewportPortal } from '@xyflow/react';
import { familyPaths, kinPath, type FamilyUnit, type KinLink, type Placed } from './familyPaths';

/*
 * Conectores de parentesco para la disposición Genealogía, al estilo de un árbol genealógico clásico:
 * barra horizontal entre la pareja, una sola bajada desde su centro, un «bus» horizontal y bajadas
 * en ángulo recto a cada hijo. El resto del parentesco que el árbol no deduce (hermanos sin
 * progenitores comunes, tíos, padrinos…) va en trazo discontinuo, también ortogonal.
 */

interface FamilyLinksProps {
  units: FamilyUnit[];
  links: KinLink[];
  positions: Map<string, Placed>;
  color: string;
  onSelect: (relationId: string) => void;
}

export function FamilyLinks({ units, links, positions, color, onSelect }: FamilyLinksProps) {
  return (
    <ViewportPortal>
      <svg className="family-links" aria-hidden>
        {units.map(unit => {
          const d = familyPaths(unit, positions).join(' ');
          if (!d) return null;
          const members = [...unit.parents, ...unit.children];
          return (
            <path
              key={members.join('|')}
              className="family-link"
              d={d}
              data-members={members.join(',')}
              style={{ stroke: color }}
            />
          );
        })}
        {links.map(link => {
          const a = positions.get(link.a);
          const b = positions.get(link.b);
          const path = a && b ? kinPath(a, b) : null;
          if (!path) return null;
          return (
            <g
              key={link.key}
              className={`family-kin ${link.conflict ? 'conflict' : ''}`}
              data-members={`${link.a},${link.b}`}
              onClick={() => onSelect(link.key)}
            >
              {link.conflict && (
                <title>No cuadra con la ascendencia registrada: revisa si alguna relación está al revés</title>
              )}
              <path className="family-link secondary" d={path.d} style={{ stroke: color }} />
              <text className="family-label" x={path.label.x} y={path.label.y}>
                {link.label}
              </text>
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}
