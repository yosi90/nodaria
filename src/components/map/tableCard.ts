import { tableColumns, sqlTypeText } from '../../domain/database';
import type { Node, Project } from '../../domain/types';
import type { Box } from './edgeGeometry';

/*
 * Tarjeta de tabla de la disposición «Base de datos»: cabecera con el nombre y una fila por columna.
 * Las medidas son fijas (las mismas que `database.css`) para que las líneas de clave foránea lleguen
 * a la altura exacta de su fila sin medir el DOM.
 */

export const TABLE_W = 260;
export const TABLE_HEAD = 44;
export const TABLE_ROW = 22;
export const TABLE_PAD = 6;

export const tableHeight = (rows: number) => TABLE_HEAD + Math.max(1, rows) * TABLE_ROW + TABLE_PAD;

export interface TableCardColumn {
  id: string;
  name: string;
  label: string;
  type: string;
  primaryKey: boolean;
  /** Referencia con valor que apunta a otra tabla. */
  foreignKey: boolean;
  unique: boolean;
  nullable: boolean;
  identity: boolean;
}

export function tableCardColumns(p: Project, node: Node, foreignKeys: Set<string> = new Set()): TableCardColumn[] {
  return tableColumns(p, node.typeId).map(c => ({
    id: c.field.id,
    name: c.field.key || c.field.label,
    label: c.field.label,
    type: sqlTypeText(c.type) + (c.sql.identity ? ' IDENTITY' : ''),
    primaryKey: c.sql.primaryKey,
    foreignKey: foreignKeys.has(c.field.id),
    unique: c.sql.unique,
    nullable: c.sql.nullable,
    identity: c.sql.identity,
  }));
}

/** Altura del centro de una fila; `row` negativo = la cabecera. */
export function rowY(box: Box, row: number) {
  return row < 0 ? box.y + TABLE_HEAD / 2 : box.y + TABLE_HEAD + row * TABLE_ROW + TABLE_ROW / 2;
}

type Point = { x: number; y: number };
export interface ForeignKeyRoute {
  d: string;
  /** Extremo de la clave foránea («muchos») y de la clave primaria («uno»), con el sentido hacia fuera de la tabla. */
  many: Point & { dir: 1 | -1 };
  one: Point & { dir: 1 | -1 };
}

const STUB = 20;
const RADIUS = 6;
const LANE_GAP = 8;

/** Polilínea ortogonal con las esquinas redondeadas. */
export function roundedPath(points: Point[]) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [prev, at, next] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(
      RADIUS,
      Math.hypot(at.x - prev.x, at.y - prev.y) / 2,
      Math.hypot(next.x - at.x, next.y - at.y) / 2,
    );
    const towards = (from: Point, to: Point, length: number) => {
      const total = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      return { x: from.x + ((to.x - from.x) / total) * length, y: from.y + ((to.y - from.y) / total) * length };
    };
    const before = towards(at, prev, r);
    const after = towards(at, next, r);
    d += ` L ${before.x} ${before.y} Q ${at.x} ${at.y} ${after.x} ${after.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Ruta de una clave foránea, como en los diagramas de SQL Server: sale del lateral de la fila de la
 * columna, va en ángulo recto y entra por el lateral de la fila de la clave primaria. Si las tablas se
 * solapan en horizontal (una encima de otra, o la misma tabla), rodea por la derecha. `lane` separa
 * las líneas que llegan a una misma tabla.
 */
export function foreignKeyRoute(a: Box, b: Box, sourceRow: number, targetRow: number, lane = 0): ForeignKeyRoute {
  const sy = rowY(a, sourceRow);
  const ty = rowY(b, targetRow);
  const shift = lane * LANE_GAP;
  let points: Point[];
  let sDir: 1 | -1;
  let tDir: 1 | -1;
  if (b.x >= a.x + a.width + 2 * STUB) {
    const mid = (a.x + a.width + b.x) / 2 + shift;
    points = [
      { x: a.x + a.width, y: sy },
      { x: mid, y: sy },
      { x: mid, y: ty },
      { x: b.x, y: ty },
    ];
    [sDir, tDir] = [1, -1];
  } else if (a.x >= b.x + b.width + 2 * STUB) {
    const mid = (a.x + b.x + b.width) / 2 - shift;
    points = [
      { x: a.x, y: sy },
      { x: mid, y: sy },
      { x: mid, y: ty },
      { x: b.x + b.width, y: ty },
    ];
    [sDir, tDir] = [-1, 1];
  } else {
    const out = Math.max(a.x + a.width, b.x + b.width) + 2 * STUB + Math.abs(shift);
    points = [
      { x: a.x + a.width, y: sy },
      { x: out, y: sy },
      { x: out, y: ty },
      { x: b.x + b.width, y: ty },
    ];
    [sDir, tDir] = [1, 1];
  }
  const start = points[0];
  const end = points[points.length - 1];
  return {
    d: roundedPath(points),
    many: { x: start.x, y: start.y, dir: sDir },
    one: { x: end.x, y: end.y, dir: tDir },
  };
}
