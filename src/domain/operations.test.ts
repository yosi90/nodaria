import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { addNode, deleteField, deleteNode, deleteSchema, typedDefault, updateNode, updateSchema } from './operations';

const world = () =>
  project({
    schemas: [
      schema('ser', { fields: [field('nombre'), field('vivo', { type: 'boolean', defaultValue: 'sí' })] }),
      schema('casa', { allowedChildTypeIds: ['personaje'], fields: [field('lema')] }),
      schema('personaje', {
        parentTypeId: 'ser',
        fields: [field('edad', { type: 'number', defaultValue: '30' }), field('dios', { type: 'nodeRef' })],
      }),
      schema('dios', { parentTypeId: 'casa' }),
      schema('venera', { sourceTypeIds: ['personaje'], targetTypeIds: ['dios'] }, 'relationship'),
    ],
    nodes: [
      node('casaX', 'casa', null, { lema: 'Fuego' }),
      node('aria', 'personaje', 'casaX', { nombre: 'Aria', dios: 'aurel' }),
      node('hijo', 'personaje', 'aria'),
      node('aurel', 'dios', null, { lema: 'Luz' }),
    ],
    relations: [relation('r1', 'venera', 'aria', 'aurel')],
  });

describe('deleteSchema', () => {
  it('lift: sube los subnodos de otros tipos al ancestro superviviente', () => {
    const p = deleteSchema(world(), 'casa', 'lift');
    expect(p.nodes.map(n => n.id)).toEqual(['aria', 'hijo', 'aurel']);
    expect(p.nodes.find(n => n.id === 'aria')!.parentId).toBeNull();
    expect(p.nodes.find(n => n.id === 'hijo')!.parentId).toBe('aria');
  });

  it('cascade: elimina también los descendientes y sus relaciones', () => {
    const p = deleteSchema(world(), 'casa', 'cascade');
    expect(p.nodes.map(n => n.id)).toEqual(['aurel']);
    expect(p.relations).toEqual([]);
  });

  it('los subtipos heredan del padre del tipo borrado y pierden sus valores', () => {
    const p = deleteSchema(world(), 'casa', 'lift');
    expect(p.schemas.find(s => s.id === 'dios')!.parentTypeId).toBeNull();
    expect(p.nodes.find(n => n.id === 'aurel')!.values).toEqual({});
  });

  it('limpia las restricciones que apuntaban al tipo borrado', () => {
    const p = deleteSchema(world(), 'dios', 'lift');
    expect(p.schemas.find(s => s.id === 'venera')!.targetTypeIds).toEqual([]);
    expect(p.nodes.find(n => n.id === 'aria')!.values.dios).toBeNull();
    expect(p.relations).toEqual([]);
  });

  it('no muta el proyecto original', () => {
    const original = world();
    const snapshot = structuredClone(original);
    deleteSchema(original, 'casa', 'cascade');
    expect(original).toEqual(snapshot);
  });
});

describe('nodos', () => {
  it('addNode aplica valores por defecto heredados y tipados', () => {
    const { project: p, nodeId } = addNode(world(), 'personaje', null);
    expect(p.nodes.find(n => n.id === nodeId)!.values).toEqual({ vivo: true, edad: 30 });
  });

  it('updateNode ignora un padre que crearía un ciclo pero guarda los valores', () => {
    const p = updateNode(world(), 'casaX', { lema: 'Agua' }, 'hijo');
    const casa = p.nodes.find(n => n.id === 'casaX')!;
    expect(casa.parentId).toBeNull();
    expect(casa.values.lema).toBe('Agua');
  });

  it('deleteNode borra descendientes, relaciones y referencias', () => {
    const p = deleteNode(world(), 'aurel');
    expect(p.relations).toEqual([]);
    expect(p.nodes.find(n => n.id === 'aria')!.values.dios).toBeNull();
    expect(deleteNode(world(), 'casaX').nodes.map(n => n.id)).toEqual(['aurel']);
  });
});

describe('tipos y campos', () => {
  it('updateSchema rechaza ciclos de herencia', () => {
    const p = world();
    const ser = p.schemas.find(s => s.id === 'ser')!;
    expect(updateSchema(p, { ...ser, parentTypeId: 'personaje' }).schemas[0].parentTypeId).toBeNull();
  });

  it('updateSchema no cambia la clase de un tipo con instancias', () => {
    const p = world();
    const casa = p.schemas.find(s => s.id === 'casa')!;
    expect(updateSchema(p, { ...casa, kind: 'relationship' }).schemas[1].kind).toBe('entity');
  });

  it('updateSchema permite cambiar la clase de un tipo sin uso y limpia sus referencias', () => {
    const p = world();
    p.schemas.push(schema('vacio'));
    p.schemas[1] = { ...p.schemas[1], allowedChildTypeIds: ['personaje', 'vacio'] };
    const vacio = p.schemas.find(s => s.id === 'vacio')!;
    const next = updateSchema(p, { ...vacio, kind: 'relationship' });
    expect(next.schemas.find(s => s.id === 'vacio')!.kind).toBe('relationship');
    expect(next.schemas[1].allowedChildTypeIds).toEqual(['personaje']);
  });

  it('deleteField elimina el campo y los valores guardados', () => {
    const p = deleteField(world(), 'casa', 'lema');
    expect(p.nodes.find(n => n.id === 'casaX')!.values).toEqual({});
    expect(p.nodes.find(n => n.id === 'aurel')!.values).toEqual({});
  });

  it('typedDefault convierte el texto al tipo del campo', () => {
    expect(typedDefault(field('a', { type: 'number', defaultValue: 'x' }))).toBeUndefined();
    expect(typedDefault(field('a', { type: 'boolean', defaultValue: 'no' }))).toBe(false);
    expect(typedDefault(field('a', { type: 'text', defaultValue: 'hola' }))).toBe('hola');
    expect(typedDefault(field('a', { type: 'computed', defaultValue: 'x' }))).toBeUndefined();
  });
});

describe('vistas guardadas', () => {
  it('guardar, aplicar y borrar una lente', async () => {
    const { applyLens, deleteLens, moveNodes, saveLens, updateView } = await import('./operations');
    let p = updateView(world(), { layout: 'force', hiddenRelationTypeIds: ['venera'] });
    p = moveNodes(p, { aria: { x: 10, y: 20 } });
    p = saveLens(p, 'Fuerzas sin cultos', true, 'l1');
    expect(p.lenses[0].positions).toEqual({ aria: { x: 10, y: 20 } });
    expect(p.view.lensId).toBe('l1');
    p = updateView(p, { layout: 'tree' });
    p = moveNodes(p, { aria: null, hijo: { x: 5, y: 5 } });
    p = applyLens(p, 'l1');
    expect(p.view.layout).toBe('force');
    expect(p.view.hiddenRelationTypeIds).toEqual(['venera']);
    expect(p.nodes.find(n => n.id === 'aria')!.positions.force).toEqual({ x: 10, y: 20 });
    expect(p.nodes.find(n => n.id === 'hijo')!.positions.force).toBeUndefined();
    // Lo fijado en otra disposición no se toca.
    expect(p.nodes.find(n => n.id === 'hijo')!.positions.tree).toEqual({ x: 5, y: 5 });
    p = deleteLens(p, 'l1');
    expect(p.lenses).toEqual([]);
    expect(p.view.lensId).toBeNull();
  });
});
