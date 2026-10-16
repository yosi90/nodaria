import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { databaseContext } from './aiContext';
import { applyProposal, defaultSelection, reviewProposal, type AiOperation, type AiProposal } from './aiProposal';
import { foreignKeyLinks, sqlType, tableColumns, type SqlColumn } from './database';
import { getSchema, nodeLabel } from './selectors';
import type { Project } from './types';

const pk: SqlColumn = {
  type: sqlType('int'),
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
};

/** Clientes y pedidos: una base con la preforma `id` y dos tablas, con la FK de pedido a cliente. */
function shop(): Project {
  return project({
    fieldLibrary: [field('titulo', { isTitle: true }), field('id', { type: 'number', sql: pk })],
    schemas: [
      schema('base', { isAbstract: true, table: true, fields: [{ ref: 'titulo' }, { ref: 'id' }] }),
      schema('cliente', {
        parentTypeId: 'base',
        description: 'Quien compra',
        fields: [field('email', { description: 'Correo de contacto' })],
      }),
      schema('pedido', {
        parentTypeId: 'base',
        fields: [
          field('id_cliente', { type: 'nodeRef', referenceTypeIds: ['cliente'] }),
          field('fecha', { type: 'date' }),
        ],
      }),
      schema('nota'),
    ],
    nodes: [
      node('n-cliente', 'cliente', null, { titulo: 'Cliente' }),
      node('n-pedido', 'pedido', null, { titulo: 'Pedido', id_cliente: 'n-cliente' }),
      node('n-nota', 'nota', null, {}),
    ],
  });
}

const proposal = (operations: AiOperation[]): AiProposal => ({ summary: '', operations, advice: [] });
const int = { name: 'int' as const, length: null, precision: null, scale: null };
const column = (name: string, patch = {}) => ({
  name,
  type: int,
  primaryKey: false,
  nullable: true,
  unique: false,
  identity: false,
  description: '',
  ...patch,
});
const names = (p: Project, typeId: string) => tableColumns(p, typeId).map(c => c.field.key);

describe('contexto de la IA', () => {
  it('envía tablas, columnas, claves y FK, sin notas ni valores de fichas', () => {
    const { context, refs } = databaseContext({
      ...shop(),
      nodes: shop().nodes.map(n => ({ ...n, notes: 'secreto' })),
    });
    expect(refs.tables).toEqual({ t1: 'n-cliente', t2: 'n-pedido' });
    expect(context.tables.map(t => t.name)).toEqual(['Cliente', 'Pedido']);
    const pedido = context.tables[1];
    expect(pedido.columns.map(c => [c.name, c.type, c.primaryKey, c.references, c.origin])).toEqual([
      ['id', 'int', true, null, 'heredada de base'],
      ['id_cliente', 'int', false, 't1', 'propia'],
      ['fecha', 'date', false, null, 'propia'],
    ]);
    expect(context.tables[0].description).toBe('Quien compra');
    expect(JSON.stringify(context)).not.toContain('secreto');
  });

  it('fuera de la parte elegida solo manda la clave primaria', () => {
    const { context } = databaseContext(shop(), ['n-pedido']);
    expect(context.tables[0]).toMatchObject({ partial: true, columns: [{ name: 'id' }] });
    expect(context.tables[1].partial).toBe(false);
  });
});

describe('propuestas de la IA', () => {
  it('crea una tabla con su nodo y su FK hacia una tabla nueva de la misma propuesta', () => {
    const p = shop();
    const { refs } = databaseContext(p);
    const plan = proposal([
      {
        op: 'create-table',
        ref: 'n1',
        name: 'Producto',
        description: 'Catálogo',
        columns: [
          column('id', { primaryKey: true, nullable: false, identity: true }),
          column('precio', { type: { name: 'decimal', length: null, precision: 10, scale: 2 } }),
        ],
        reason: '',
      },
      {
        op: 'create-table',
        ref: 'n2',
        name: 'Linea_pedido',
        description: '',
        columns: [column('id', { primaryKey: true, nullable: false, identity: true }), column('cantidad')],
        reason: '',
      },
      { op: 'add-foreign-key', table: 'n2', column: 'id_pedido', references: 't2', nullable: false, reason: '' },
      { op: 'add-foreign-key', table: 'n2', column: 'id_producto', references: 'n1', nullable: false, reason: '' },
    ]);
    const review = reviewProposal(p, plan, refs, defaultSelection(plan), 'x');
    expect(review.operations.map(o => o.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    const next = review.project;
    const linea = next.nodes.find(n => nodeLabel(next, n) === 'Linea_pedido')!;
    expect(getSchema(next, linea.typeId)).toMatchObject({ table: true, icon: 'table-2' });
    expect(names(next, linea.typeId)).toEqual(['id', 'cantidad', 'id_pedido', 'id_producto']);
    const producto = next.nodes.find(n => nodeLabel(next, n) === 'Producto')!;
    expect(
      foreignKeyLinks(next)
        .filter(l => l.sourceId === linea.id)
        .map(l => l.targetId),
    ).toEqual(['n-pedido', producto.id]);
    expect(tableColumns(next, producto.typeId)[1].type).toMatchObject({ name: 'decimal', precision: 10, scale: 2 });
    expect(review.issues).toEqual([]);
    // Con la misma semilla, el reducer aplica exactamente lo que se previsualiza.
    const timeless = (x: Project) => ({ ...x, nodes: x.nodes.map(n => ({ ...n, createdAt: '' })) });
    expect(timeless(applyProposal(p, plan, refs, defaultSelection(plan), 'x'))).toEqual(timeless(next));
  });

  it('las operaciones que dependen de una tabla nueva desmarcada no se aplican', () => {
    const p = shop();
    const plan = proposal([
      { op: 'create-table', ref: 'n1', name: 'Producto', description: '', columns: [column('id')], reason: '' },
      { op: 'add-column', table: 'n1', column: column('stock'), reason: '' },
    ]);
    const review = reviewProposal(p, plan, databaseContext(p).refs, [1]);
    expect(review.operations[0]).toMatchObject({ status: 'ok', applied: false });
    expect(review.operations[1]).toMatchObject({ status: 'invalid', applied: false });
    expect(review.operations[1].messages[0]).toContain('no se va a crear');
    expect(review.project).toBe(p);
  });

  it('rechaza lo que el editor no admitiría y no toca el proyecto', () => {
    const p = shop();
    const plan = proposal([
      { op: 'add-column', table: 't1', column: column('email'), reason: '' },
      {
        op: 'add-column',
        table: 't1',
        column: column('nombre', { type: { name: 'nvarchar', length: 9000, precision: null, scale: null } }),
        reason: '',
      },
      {
        op: 'add-column',
        table: 't1',
        column: column('x', { type: { name: 'texto', length: null, precision: null, scale: null } }),
        reason: '',
      },
      {
        op: 'update-column',
        table: 't9',
        column: 'id',
        changes: { type: null, primaryKey: null, nullable: null, unique: true, identity: null, description: null },
        reason: '',
      },
      { op: 'create-table', ref: 'n1', name: 'cliente', description: '', columns: [], reason: '' },
      { op: 'create-table', ref: 't2', name: 'Otra', description: '', columns: [], reason: '' },
      { op: 'add-foreign-key', table: 't2', column: 'fecha', references: 't1', nullable: true, reason: '' },
    ] as AiOperation[]);
    const review = reviewProposal(p, plan, databaseContext(p).refs);
    expect(review.operations.map(o => o.status)).toEqual(Array(7).fill('invalid'));
    expect(review.operations.map(o => o.messages[0])).toEqual([
      '«Cliente» ya tiene la columna «email».',
      'La longitud de nvarchar va de 1 a 4000 (o max).',
      'El tipo «texto» no es de SQL Server.',
      'No hay ninguna tabla «t9».',
      'Ya hay una tabla «cliente».',
      'La referencia «t2» ya está en uso.',
      '«fecha» ya existe y no es una referencia a otra tabla.',
    ]);
    expect(review.project).toBe(p);
  });

  it('cambia una columna heredada solo en su tipo, y una propia en su definición', () => {
    const p = shop();
    const plan = proposal([
      {
        op: 'update-column',
        table: 't2',
        column: 'id',
        changes: {
          type: { name: 'bigint', length: null, precision: null, scale: null },
          primaryKey: null,
          nullable: null,
          unique: null,
          identity: null,
          description: 'otra',
        },
        reason: '',
      },
      {
        op: 'update-column',
        table: 't1',
        column: 'email',
        changes: {
          type: { name: 'nvarchar', length: 320, precision: null, scale: null },
          primaryKey: null,
          nullable: false,
          unique: true,
          identity: null,
          description: 'Correo',
        },
        reason: '',
      },
    ]);
    const review = reviewProposal(p, plan, databaseContext(p).refs);
    expect(review.operations.map(o => o.status)).toEqual(['warning', 'ok']);
    const next = review.project;
    expect(tableColumns(next, 'pedido')[0].type.name).toBe('bigint');
    expect(tableColumns(next, 'cliente')[0].type.name).toBe('int');
    expect(getSchema(next, 'pedido')!.sqlOverrides.id.type?.name).toBe('bigint');
    const email = tableColumns(next, 'cliente')[1];
    expect(email.field.description).toBe('Correo');
    expect(email.sql).toMatchObject({ nullable: false, unique: true, type: { name: 'nvarchar', length: 320 } });
  });

  it('los borrados salen desmarcados y, al marcarlos, quitan columna y tabla', () => {
    const p = shop();
    const plan = proposal([
      { op: 'delete-column', table: 't2', column: 'fecha', reason: '' },
      { op: 'delete-column', table: 't2', column: 'id', reason: '' },
      { op: 'delete-table', table: 't1', reason: '' },
    ]);
    expect(defaultSelection(plan)).toEqual([]);
    const untouched = reviewProposal(p, plan, databaseContext(p).refs);
    expect(untouched.operations.every(o => o.destructive && !o.applied)).toBe(true);
    expect(untouched.project).toBe(p);

    const review = reviewProposal(p, plan, databaseContext(p).refs, [0, 1, 2]);
    expect(review.operations[2].messages).toEqual(['Dejan de apuntarle «Pedido».']);
    const next = review.project;
    expect(names(next, 'pedido')).toEqual(['id_cliente']);
    expect(getSchema(next, 'pedido')!.hiddenFieldIds).toEqual(['id']);
    expect(next.nodes.map(n => n.id)).toEqual(['n-pedido', 'n-nota']);
    expect(getSchema(next, 'cliente')).toBeUndefined();
    expect(next.nodes[0].values.id_cliente).toBeNull();
  });

  it('renombra tablas y columnas, y avisa si otras tablas comparten la definición', () => {
    const p = shop();
    const plan = proposal([
      { op: 'rename-table', table: 't1', name: 'Clientes', reason: '' },
      { op: 'rename-column', table: 't2', column: 'fecha', name: 'fecha_pedido', reason: '' },
      { op: 'rename-column', table: 't2', column: 'id', name: 'codigo', reason: '' },
      { op: 'rename-table', table: 't2', name: 'clientes', reason: '' },
    ]);
    const review = reviewProposal(p, plan, databaseContext(p).refs);
    expect(review.operations.map(o => o.status)).toEqual(['ok', 'ok', 'warning', 'invalid']);
    expect(review.operations[2].messages[0]).toContain('también cambia en «Clientes»');
    expect(nodeLabel(review.project, review.project.nodes[0])).toBe('Clientes');
    expect(names(review.project, 'pedido')).toEqual(['codigo', 'id_cliente', 'fecha_pedido']);
  });

  it('resuelve contra el proyecto actual: una tabla borrada después de pedir la propuesta ya no vale', () => {
    const before = shop();
    const { refs } = databaseContext(before);
    const after = { ...before, nodes: before.nodes.filter(n => n.id !== 'n-cliente') };
    const review = reviewProposal(
      after,
      proposal([{ op: 'add-column', table: 't1', column: column('alta'), reason: '' }]),
      refs,
    );
    expect(review.operations[0]).toMatchObject({ status: 'invalid', messages: ['La tabla «t1» ya no existe.'] });
  });

  it('avisa de los problemas que quedarían en las tablas tocadas', () => {
    const p = shop();
    const plan = proposal([
      { op: 'add-column', table: 't1', column: column('otro_id', { identity: true }), reason: '' },
    ]);
    expect(reviewProposal(p, plan, databaseContext(p).refs).issues).toEqual([
      'cliente: Solo puede haber una columna IDENTITY por tabla.',
    ]);
  });
});
