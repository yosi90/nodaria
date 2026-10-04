import { describe, expect, it } from 'vitest';
import { repairProject } from '../integrity';
import { getSchema, allFields, fieldValue, compatibleRelationTypes, canContain } from '../selectors';
import { matchesQuery } from '../queries';
import { TEMPLATES, mergeTemplate, templateById } from './index';
import { isFieldLink } from '../library';

describe('templates', () => {
  it.each(TEMPLATES.map(t => [t.id, t] as const))('%s builds a consistent project', (_id, template) => {
    const project = template.build();
    const { project: repaired, issues } = repairProject(project);
    expect(issues).toEqual([]);
    expect(repaired.nodes.length).toBe(project.nodes.length);
    // Cada nodo es de un tipo instanciable y cuelga de un padre que lo admite.
    project.nodes.forEach(n => {
      const schema = getSchema(project, n.typeId);
      expect(schema?.kind, n.id).toBe('entity');
      expect(schema?.isAbstract, n.id).toBe(false);
      if (n.parentId) {
        const parent = project.nodes.find(x => x.id === n.parentId);
        expect(parent, n.id).toBeDefined();
        expect(canContain(project, parent!.typeId, n.typeId), `${n.id} en ${n.parentId}`).toBe(true);
      }
      // Los valores apuntan a atributos reales del tipo.
      const fields = allFields(project, n.typeId);
      Object.keys(n.values).forEach(fieldId =>
        expect(
          fields.some(f => f.id === fieldId),
          `${n.id}.${fieldId}`,
        ).toBe(true),
      );
    });
    // Cada relación es de un tipo compatible con sus extremos.
    project.relations.forEach(r => {
      expect(
        compatibleRelationTypes(project, r.sourceId, r.targetId).some(s => s.id === r.typeId),
        `${r.typeId}: ${r.sourceId} → ${r.targetId}`,
      ).toBe(true);
    });
    // Los vínculos a preformas existen.
    project.schemas.forEach(s =>
      s.fields.forEach(f => {
        if (isFieldLink(f))
          expect(
            project.fieldLibrary.some(l => l.id === f.ref),
            `${s.id} → ${f.ref}`,
          ).toBe(true);
      }),
    );
    // Los ids de los filtros de las vistas y de las consultas son reales.
    project.lenses.forEach(l => {
      [...l.view.hiddenEntityTypeIds, ...l.view.hiddenRelationTypeIds].forEach(id =>
        expect(
          project.schemas.some(s => s.id === id),
          `${l.name}: ${id}`,
        ).toBe(true),
      );
    });
    project.queries.forEach(q => expect(getSchema(project, q.typeId), q.name).toBeDefined());
  });

  it('computed fields of the examples evaluate', () => {
    const cars = templateById('cars')!.build();
    const corsa = cars.nodes.find(n => n.id === 'corsa')!;
    const piezas = allFields(cars, 'modelo').find(f => f.id === 'modelo_piezas')!;
    expect(fieldValue(piezas, corsa.values, allFields(cars, 'modelo'), { project: cars, node: corsa })).toBe('3');

    const pn = templateById('puerto-norte')!.build();
    const cena = pn.nodes.find(n => n.id === 'cena')!;
    const asistentes = allFields(pn, 'reunion').find(f => f.id === 'reunion_asistentes')!;
    expect(
      String(fieldValue(asistentes, cena.values, allFields(pn, 'reunion'), { project: pn, node: cena })),
    ).toContain('Ramiro Varela');
  });

  it('saved queries of Puerto Norte answer the investigation', () => {
    const pn = templateById('puerto-norte')!.build();
    const byName = (name: string) => pn.queries.find(q => q.name === name)!;
    expect(pn.nodes.filter(n => matchesQuery(pn, n, byName('Imputados sin abogado'))).map(n => n.id)).toEqual([
      'tomas',
      'esteban',
    ]);
    expect(pn.nodes.filter(n => matchesQuery(pn, n, byName('Documentos poco fiables'))).map(n => n.id)).toEqual([
      'doc_correo',
    ]);
    expect(
      pn.nodes.filter(n => matchesQuery(pn, n, byName('Empresas sin administrador conocido'))).map(n => n.id),
    ).toEqual(['fundacion']);
  });

  it('merges template types into an existing project without duplicates', () => {
    const base = templateById('cars')!.build();
    const once = mergeTemplate(base, templateById('fantasy')!.build());
    const twice = mergeTemplate(once, templateById('fantasy')!.build());
    expect(once.schemas.length).toBeGreaterThan(base.schemas.length);
    expect(twice).toBe(once);
    expect(once.nodes.length).toBe(base.nodes.length);
  });

  it('builds a fresh project id each time', () => {
    expect(templateById('cars')!.build().id).not.toBe(templateById('cars')!.build().id);
  });
});
