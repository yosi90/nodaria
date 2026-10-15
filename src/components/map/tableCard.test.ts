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

  it('coloca las referenciadas a la izquierda y lo que no es tabla debajo', () => {
    const positions = databaseLayout(p, null, [], NODE_H);
    const x = (id: string) => positions.get(id)!.x;
    expect(x('empresa')).toBeLessThan(x('sede'));
    expect(x('sede')).toBeLessThan(x('union'));
    expect(x('suelta')).toBeGreaterThan(x('union'));
    const bottom = Math.max(...['empresa', 'sede', 'union', 'suelta'].map(id => positions.get(id)!.y + tableHeight(2)));
    expect(positions.get('idea')!.y).toBeGreaterThan(bottom);
  });
});
