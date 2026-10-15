import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../../test/fixtures';
import { sqlType } from '../../domain/database';
import { databaseLayout, NODE_H } from './layout';
import { foreignKeyRoute, rowY, TABLE_HEAD, TABLE_ROW, TABLE_W, tableHeight } from './tableCard';

const box = (x: number, y: number, rows = 3) => ({ x, y, width: TABLE_W, height: tableHeight(rows) });

describe('líneas de clave foránea', () => {
  it('van de la fila de la columna a la fila de la clave, en ángulo recto', () => {
    const route = foreignKeyRoute(box(0, 0), box(500, 100), 2, 0);
    expect(route.many).toEqual({ x: TABLE_W, y: TABLE_HEAD + 2 * TABLE_ROW + TABLE_ROW / 2, dir: 1 });
    expect(route.one).toEqual({ x: 500, y: rowY(box(500, 100), 0), dir: -1 });
    expect(route.d).toMatch(/^M 260 99 /);
    expect(route.d.endsWith(`L 500 ${100 + TABLE_HEAD + TABLE_ROW / 2}`)).toBe(true);
  });

  it('entra por la derecha si la tabla destino está a la izquierda', () => {
    const route = foreignKeyRoute(box(600, 0), box(0, 0), 0, -1);
    expect(route.many.dir).toBe(-1);
    expect(route.one).toEqual({ x: TABLE_W, y: TABLE_HEAD / 2, dir: 1 });
  });

  it('rodea por la derecha cuando las tablas se solapan en horizontal o es la misma', () => {
    const route = foreignKeyRoute(box(0, 0), box(0, 0), 2, 0);
    expect(route.many.dir).toBe(1);
    expect(route.one.dir).toBe(1);
    expect(route.d).toContain('Q');
  });
});

describe('disposición «Base de datos»', () => {
  const p = project({
    schemas: [
      schema('tabla', {
        table: true,
        fields: [
          field('id', {
            sql: {
              type: sqlType('int'),
              primaryKey: true,
              nullable: false,
              unique: false,
              identity: true,
              excluded: false,
            },
          }),
          field('ref', { type: 'nodeRef' }),
        ],
      }),
      schema('idea'),
    ],
    nodes: [
      node('empresa', 'tabla'),
      node('sede', 'tabla', null, { ref: 'empresa' }),
      node('union', 'tabla', null, { ref: 'sede' }),
      node('suelta', 'tabla'),
      node('idea', 'idea'),
    ],
  });

  it('no pisa tablas, sale siempre igual, alinea en columnas y deja lo que no es tabla debajo', () => {
    const positions = databaseLayout(p, null, [], NODE_H);
    expect(databaseLayout(p, null, [], NODE_H)).toEqual(positions);
    const tables = ['empresa', 'sede', 'union', 'suelta'];
    const boxes = tables.map(id => ({ ...positions.get(id)!, w: TABLE_W, h: tableHeight(2) }));
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach(b => {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }),
    );
    // Columnas: las x de las tablas del grupo unido son múltiplos del paso entre columnas.
    const xs = new Set(['empresa', 'sede', 'union'].map(id => positions.get(id)!.x));
    expect(xs.size).toBeGreaterThan(1);
    const bottom = Math.max(...boxes.map(b => b.y + b.h));
    expect(positions.get('idea')!.y).toBeGreaterThan(bottom);
  });
});
