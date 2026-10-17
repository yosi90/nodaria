import { describe, expect, it } from 'vitest';
import { appReducer } from '../state/reducer';
import { field, project, schema } from '../test/fixtures';
import { formulaIssues, withRenamedFields } from './formulaRenames';
import type { FieldDefinition, Project, Schema } from './types';

const computed = (id: string, formula: string) => field(id, { type: 'computed', formula });

const base = (): Project =>
  project({
    schemas: [
      schema('ciudad', { name: 'Ciudad', fields: [field('poblacion', { type: 'number' })] }),
      schema('persona', {
        name: 'Persona',
        fields: [
          field('edad', { label: 'Edad', type: 'number' }),
          field('nacimiento', { type: 'date' }),
          field('ciudad', { type: 'nodeRef', referenceTypeIds: ['ciudad'] }),
          field('amigos', { type: 'nodeRefs', referenceTypeIds: ['persona'] }),
          computed(
            'resumen',
            '{Edad} años, {edad(nacimiento)} cumplidos, vive en {ciudad.poblacion} · {contar(amigos)} amigos · {padre.edad}',
          ),
        ],
      }),
      // Otro tipo con un atributo que también se llama «edad»: no se toca.
      schema('mascota', {
        name: 'Mascota',
        fields: [
          field('mascota_edad', { key: 'edad', label: 'edad', type: 'number' }),
          computed('texto', 'Tiene {edad}'),
        ],
      }),
      schema(
        'amistad',
        { name: 'Amistad', kind: 'relationship', fields: [field('desde'), computed('t', 'Desde {desde}')] },
        'relationship',
      ),
    ],
  });

/** El proyecto con el atributo `fieldId` del tipo `typeId` cambiado. */
const renamed = (p: Project, typeId: string, fieldId: string, patch: Partial<FieldDefinition>): Project => ({
  ...p,
  schemas: p.schemas.map(s =>
    s.id === typeId
      ? { ...s, fields: s.fields.map(f => ('ref' in f || f.id !== fieldId ? f : { ...f, ...patch })) }
      : s,
  ),
});

const formula = (p: Project, typeId: string, fieldId: string) =>
  (p.schemas.find(s => s.id === typeId)!.fields.find(f => !('ref' in f) && f.id === fieldId) as FieldDefinition)
    .formula;

describe('withRenamedFields', () => {
  it('reescribe lo que cita el atributo renombrado, por clave o etiqueta, y nada más', () => {
    const before = base();
    const after = withRenamedFields(before, renamed(before, 'persona', 'edad', { key: 'anios', label: 'Años' }));
    expect(formula(after, 'persona', 'resumen')).toBe(
      '{anios} años, {edad(nacimiento)} cumplidos, vive en {ciudad.poblacion} · {contar(amigos)} amigos · {padre.anios}',
    );
    // «edad» de Mascota es otro atributo.
    expect(formula(after, 'mascota', 'texto')).toBe('Tiene {edad}');
  });

  it('sigue las referencias, los argumentos de las funciones y contar', () => {
    let p = base();
    p = withRenamedFields(p, renamed(p, 'ciudad', 'poblacion', { key: 'habitantes' }));
    p = withRenamedFields(p, renamed(p, 'persona', 'nacimiento', { key: 'fecha_nac' }));
    p = withRenamedFields(p, renamed(p, 'persona', 'amigos', { key: 'amistades' }));
    expect(formula(p, 'persona', 'resumen')).toBe(
      '{Edad} años, {edad(fecha_nac)} cumplidos, vive en {ciudad.habitantes} · {contar(amistades)} amigos · {padre.edad}',
    );
  });

  it('reescribe las preformas calculadas y las fórmulas de las relaciones', () => {
    const shared: Project = {
      ...base(),
      fieldLibrary: [computed('ficha', 'Nacido el {nacimiento}')],
      schemas: base().schemas.map((s: Schema) =>
        s.id === 'persona' ? { ...s, fields: [...s.fields, { ref: 'ficha' }] } : s,
      ),
    };
    const after = withRenamedFields(shared, renamed(shared, 'persona', 'nacimiento', { key: 'nace' }));
    expect(after.fieldLibrary[0].formula).toBe('Nacido el {nace}');
    const relation = withRenamedFields(shared, renamed(shared, 'amistad', 'desde', { key: 'inicio' }));
    expect(formula(relation, 'amistad', 't')).toBe('Desde {inicio}');
  });

  it('sin renombrados devuelve el mismo proyecto', () => {
    const p = base();
    expect(withRenamedFields(p, p)).toBe(p);
  });

  it('el reductor reescribe al guardar el tipo con el atributo renombrado', () => {
    const p = base();
    const state = { version: 3 as const, projects: [p], activeProjectId: p.id };
    const persona = renamed(p, 'persona', 'edad', { key: 'anios' }).schemas.find(s => s.id === 'persona')!;
    const next = appReducer(state, { type: 'update-schema', schema: persona });
    expect(formula(next.projects[0], 'persona', 'resumen')).toContain('{anios} años');
  });
});

describe('formulaIssues', () => {
  it('avisa de las fórmulas que citan nombres que no existen', () => {
    const p = base();
    expect(formulaIssues(p)).toEqual([]);
    const broken = {
      ...p,
      schemas: p.schemas.map(s =>
        s.id === 'mascota' ? { ...s, fields: [...s.fields, computed('x', 'Peso: {peso}')] } : s,
      ),
    };
    const issues = formulaIssues(broken);
    expect(issues.map(i => [i.schema.id, i.field.id])).toEqual([['mascota', 'x']]);
    expect(issues[0].warnings[0]).toContain('peso');
  });
});
