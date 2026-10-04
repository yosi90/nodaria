import { ViewportPortal } from '@xyflow/react';
import type { Position } from '../../domain/types';
import { familyPaths, type FamilyUnit } from './familyPaths';

/*
 * Conectores de familia para la disposición Genealogía, al estilo de un árbol genealógico clásico:
 * barra horizontal entre la pareja, una sola bajada desde su centro, un «bus» horizontal y bajadas
 * en ángulo recto a cada hijo. Sustituyen a las flechas individuales de progenitor y cónyuge.
 */

interface FamilyLinksProps {
  units: FamilyUnit[];
  positions: Map<string, Position>;
  color: string;
}

export function FamilyLinks({ units, positions, color }: FamilyLinksProps) {
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
      </svg>
    </ViewportPortal>
  );
}
