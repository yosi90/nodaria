import { describe, expect, it } from 'vitest';
import { evaluateFormula } from './formulas';
import { fieldValue } from './selectors';
import { field, node, project, relation, schema } from '../test/fixtures';

const p = project({
  schemas: [
    schema('personaje', {
      name: 'Personaje',
      fields: [
        field('nombre', { isTitle: true }),
        field('edad', { type: 'number' }),
        field('dios', { type: 'nodeRef', label: 'Dios patrón' }),
        field('aliados', { type: 'nodeRefs' }),
        field('rasgos', { type: 'tags' }),
        field('vivo', { type: 'boolean' }),
        field('ficha', { type: 'computed', formula: '{nombre}, {edad} años' }),
        field('resumen', { type: 'computed', formula: '{ficha} · {contar(relaciones)} relaciones' }),
        field('bucle', { type: 'computed', formula: '{bucle}!' }),
      ],
    }),
    schema('deidad', { name: 'Deidad', fields: [field('dnombre', { isTitle: true }), field('dominio')] }),
    schema('lugar', {
      name: 'Lugar',
      fields: [field('lnombre', { isTitle: true })],
      allowedChildTypeIds: ['personaje'],
    }),
    schema('amistad', { name: 'Amistad' }, 'relationship'),
    schema('rivalidad', { name: 'Rivalidad' }, 'relationship'),
  ],
  nodes: [
    node('vael', 'lugar', null, { lnombre: 'Vael' }),
    node('sol', 'deidad', null, { dnombre: 'Solenne', dominio: 'Luz' }),
    node('aria', 'personaje', 'vael', {
      nombre: 'Aria',
      edad: 30,
      dios: 'sol',
      aliados: ['bren', 'cato'],
      rasgos: ['valiente', 'terca'],
      vivo: true,
    }),
    node('bren', 'personaje', 'vael', { nombre: 'Bren' }),
    node('cato', 'personaje', null, { nombre: 'Cato' }),
  ],
  relations: [
    relation('r1', 'amistad', 'aria', 'bren'),
    relation('r2', 'amistad', 'cato', 'aria'),
    relation('r3', 'rivalidad', 'aria', 'cato'),
  ],
});
const aria = p.nodes[2];
const ev = (formula: string) => evaluateFormula(p, aria, formula);

describe('evaluateFormula', () => {
  it('resuelve atributos propios, por clave o por etiqueta, y los tipos especiales', () => {
    expect(ev('{nombre} tiene {edad}')).toBe('Aria tiene 30');
    expect(ev('{rasgos}')).toBe('valiente, terca');
    expect(ev('{vivo}')).toBe('Sí');
    expect(ev('{Dios patrón}')).toBe('Solenne');
  });

  it('sigue referencias y lee atributos del nodo referido', () => {
    expect(ev('{dios}')).toBe('Solenne');
    expect(ev('{dios.dominio}')).toBe('Luz');
    expect(ev('{aliados}')).toBe('Bren, Cato');
    expect(ev('{aliados.nombre}')).toBe('Bren, Cato');
  });

  it('expone título, tipo y padre', () => {
    expect(ev('{titulo} ({tipo}) de {padre}')).toBe('Aria (Personaje) de Vael');
    expect(ev('{padre.lnombre}')).toBe('Vael');
    expect(evaluateFormula(p, p.nodes[4], '[{padre}]')).toBe('[]');
  });

  it('cuenta y lista relaciones, hijos y referencias', () => {
    expect(ev('{contar(relaciones)}')).toBe('3');
    expect(ev('{contar(relaciones:Amistad)}')).toBe('2');
    expect(ev('{contar(relaciones:rivalidad)}')).toBe('1');
    expect(ev('{lista(relaciones:Amistad)}')).toBe('Bren, Cato');
    expect(ev('{contar(aliados)}')).toBe('2');
    expect(ev('{contar(rasgos)}')).toBe('2');
    expect(evaluateFormula(p, p.nodes[0], '{contar(hijos)}: {lista(hijos)}')).toBe('2: Aria, Bren');
  });

  it('anida calculados y corta los bucles', () => {
    expect(ev('{resumen}')).toBe('Aria, 30 años · 3 relaciones');
    expect(ev('{bucle}')).toMatch(/^!+$/);
  });

  it('ignora expresiones desconocidas', () => {
    expect(ev('[{nada}] [{contar(nada)}] [{dios.nada}]')).toBe('[] [] []');
  });

  it('fieldValue usa el motor completo cuando recibe el nodo', () => {
    const fields = p.schemas[0].fields as never;
    const ficha = p.schemas[0].fields[6] as never;
    expect(fieldValue(ficha, aria.values, fields, { project: p, node: aria })).toBe('Aria, 30 años');
    // Sin contexto (relaciones) conserva la sustitución simple por clave.
    expect(fieldValue(ficha, aria.values, fields)).toBe('Aria, 30 años');
  });
});
