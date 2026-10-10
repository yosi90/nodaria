import { describe, expect, it } from 'vitest';
import { formulaWarnings } from './formulaDiagnostics';
import { field, project, schema } from '../test/fixtures';
import { allFields } from './selectors';

const birth = field('birth-id', { key: 'fecha_de_nacimiento', label: 'Fecha de nacimiento', type: 'date' });
const p = project({
  schemas: [
    schema('base', { fields: [birth] }),
    schema('person', {
      parentTypeId: 'base',
      fields: [
        field('nombre'),
        field('dios', { type: 'nodeRef', referenceTypeIds: ['deidad'] }),
        field('edad', { type: 'computed', formula: '{edad(Fecha de nacimiento)}' }),
      ],
    }),
    schema('deidad', { fields: [field('fundacion', { type: 'date' })] }),
    schema('amistad', { name: 'Amistad' }, 'relationship'),
  ],
});

const fields = allFields(p, 'person');
const warnings = (formula: string) => formulaWarnings(p, fields, formula);

describe('formulaWarnings', () => {
  it('detecta el atributo inexistente del ejemplo aunque no haya fichas', () => {
    expect(warnings('{edad(nacimiento)}')).toEqual(['El atributo «nacimiento» no está definido en este tipo.']);
    expect(warnings('{nacimiento} · {edad(nacimiento)}')).toHaveLength(1);
  });

  it('acepta nombres, claves e herencia sin exigir valores', () => {
    expect(warnings('{edad(FECHA DE NACIMIENTO)} {edad(fecha_de_nacimiento)} {nombre} {edad}')).toEqual([]);
    expect(warnings('{edad(1996-05-20, hoy)} {hoy.anio} {Fecha de nacimiento.dia}')).toEqual([]);
  });

  it('distingue una fecha de otro tipo de atributo', () => {
    expect(warnings('{edad(nombre)}')).toEqual(['El atributo «nombre» debe ser de tipo Fecha.']);
  });

  it('valida las rutas sin confundirlas con nombres del nodo actual', () => {
    expect(warnings('{edad(dios.fundacion)} {edad(padre.fecha_de_nacimiento)}')).toEqual([]);
    expect(warnings('{dios.inexistente}')).toEqual(['El atributo «inexistente» no está definido en este tipo.']);
    expect(warnings('{nombre.dia}')).toHaveLength(1);
  });

  it('acepta funciones de listas y cuenta relaciones por nombre', () => {
    expect(warnings('{contar(relaciones:Amistad)} {lista(hijos)} {contar(nombre)} {tipo} {padre}')).toEqual([]);
    expect(warnings('{lista(relaciones:Enemistad)}')).toHaveLength(1);
  });

  it('avisa de sintaxis y argumentos incompletos', () => {
    for (const formula of [
      '{edad(nacimiento)',
      '{}',
      '{edad()}',
      '{edad(hoy,)}',
      '{diasemana(hoy, hoy)}',
      '{suma(nombre)}',
    ])
      expect(warnings(formula).length).toBeGreaterThan(0);
  });

  it('respeta el motor limitado a claves de las relaciones', () => {
    expect(formulaWarnings(p, [birth], '{fecha_de_nacimiento}', 'relationship')).toEqual([]);
    expect(formulaWarnings(p, [birth], '{edad(fecha_de_nacimiento)}', 'relationship')).toHaveLength(1);
    expect(formulaWarnings(p, [birth], '{Fecha de nacimiento}', 'relationship')).toHaveLength(1);
  });

  it('acepta rutas presentes en alguno de los tipos permitidos por una referencia', () => {
    const multi = fields.map(f => (f.key === 'dios' ? { ...f, referenceTypeIds: ['person', 'deidad'] } : f));
    expect(formulaWarnings(p, multi, '{edad(dios.fundacion)}')).toEqual([]);
    expect(formulaWarnings(p, multi, '{edad(dios.nada)}')).toHaveLength(1);
  });
});
