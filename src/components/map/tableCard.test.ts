import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../../test/fixtures';
import { readSqlColumn, sqlType, tableHasDescriptions } from '../../domain/database';
import { sqlScript } from '../../domain/sqlScript';
import { databaseLayout, NODE_H } from './layout';
import {
  foreignKeyRoute,
  rowY,
  TABLE_HEAD,
  TABLE_ROW,
  TABLE_W,
  tableCardColumns,
  tableHeight,
  tableWidth,
} from './tableCard';

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

describe('descripciones de las columnas', () => {
  const pkColumn = {
    type: sqlType('int'),
    primaryKey: true,
    nullable: false,
    unique: false,
    identity: true,
    excluded: false,
  };
  const p = project({
    schemas: [
      schema('cliente', {
        table: true,
        fields: [
          field('titulo', { isTitle: true }),
          field('id', { sql: { ...pkColumn, description: 'Identificador interno' } }),
          field('nombre', { description: 'Nombre comercial' }),
        ],
      }),
      schema('pedido', {
        table: true,
        fields: [
          field('titulo', { isTitle: true }),
          field('pid', { sql: pkColumn }),
          field('cliente', { type: 'nodeRef' }),
        ],
      }),
    ],
    nodes: [
      node('c1', 'cliente'),
      node('c2', 'cliente'),
      node('p1', 'pedido', null, { cliente: 'c1' }),
      node('p2', 'pedido', null, { cliente: 'c2' }),
    ],
  });

  it('la tabla enseña la descripción propia o la del atributo, y solo si alguna la tiene', () => {
    expect(tableCardColumns(p, p.nodes[0]).map(c => c.description)).toEqual([
      'Identificador interno',
      'Nombre comercial',
    ]);
    expect(tableHasDescriptions(p, 'cliente')).toBe(true);
    expect(tableHasDescriptions(p, 'pedido')).toBe(false);
    expect(tableWidth(true)).toBeGreaterThan(tableWidth(false));
  });

  it('la disposición no pisa las tablas más anchas', () => {
    const positions = databaseLayout(p, null, [], NODE_H);
    const boxes = p.nodes.map(n => ({
      ...positions.get(n.id)!,
      w: tableWidth(tableHasDescriptions(p, n.typeId)),
      h: tableHeight(2),
    }));
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach(b => {
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }),
    );
  });

  it('el script las guarda como MS_Description', () => {
    const script = sqlScript(p);
    expect(script).toContain(
      "@value = N'Identificador interno', @level0type = N'SCHEMA', @level0name = N'dbo', @level1type = N'TABLE'",
    );
    expect(script).toContain("@level2type = N'COLUMN', @level2name = N'nombre';");
    expect(script.match(/MS_Description/g)).toHaveLength(4);
  });

  it('una descripción vacía no se guarda y se leen con cautela', () => {
    expect(readSqlColumn({ ...pkColumn, description: '   ' })?.description).toBeUndefined();
    expect(readSqlColumn({ ...pkColumn, description: 'x'.repeat(900) })?.description).toHaveLength(500);
  });
});
