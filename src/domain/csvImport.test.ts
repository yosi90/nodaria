import { describe, expect, it } from 'vitest';
import { exportBundle } from '../services/exportBundle';
import { field, node, project, schema } from '../test/fixtures';
import { guessMapping, importCsvRows, parseCsv } from './csvImport';
import { nodeLabel } from './selectors';

const p = project({
  schemas: [
    schema('persona', {
      name: 'Persona',
      allowedChildTypeIds: ['persona'],
      fields: [
        field('nombre', { label: 'Nombre', isTitle: true }),
        field('edad', { label: 'Edad', type: 'number' }),
        field('viva', { label: 'Viva', type: 'boolean' }),
      ],
    }),
  ],
});

describe('parseCsv', () => {
  it('lee «;» o «,», comillas, saltos de línea dentro de una celda y la marca BOM', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(parseCsv(`${bom}a;b\r\n"x; ""y""";"dos\nlíneas"\r\n\r\n`)).toEqual({
      header: ['a', 'b'],
      rows: [['x; "y"', 'dos\nlíneas']],
    });
    expect(parseCsv('a,b\n1,2')).toEqual({ header: ['a', 'b'], rows: [['1', '2']] });
  });
});

describe('importCsvRows', () => {
  it('propone la correspondencia por nombre y crea un nodo por fila con título', () => {
    const table = parseCsv('Nombre;Edad;Dentro de;Otra;Notas\nAna;30;;x;Mayor\nLuis;doce;Ana;;\n;5;;;\nEva;7;Nadie;;');
    const mapping = guessMapping(p, 'persona', table.header);
    expect(mapping).toEqual([
      { kind: 'title' },
      { kind: 'field', fieldId: 'edad' },
      { kind: 'parent' },
      null,
      { kind: 'notes' },
    ]);
    const result = importCsvRows(p, 'persona', table, mapping);
    expect(result).toMatchObject({ created: 3, skipped: 1, unplaced: 1 });
    const [ana, luis, eva] = result.project.nodes;
    expect(ana).toMatchObject({ values: { nombre: 'Ana', edad: 30 }, notes: 'Mayor', parentId: null });
    expect(luis).toMatchObject({ parentId: ana.id });
    expect(luis.values.edad).toBeUndefined();
    expect(eva.parentId).toBeNull();
  });

  it('vuelve a leer el CSV que exporta Nodaria', () => {
    const source = {
      ...p,
      nodes: [
        node('ana', 'persona', null, { nombre: 'Ana; "la mayor"', edad: 30, viva: true }),
        { ...node('luis', 'persona', 'ana', { nombre: 'Luis', viva: false }), notes: 'Hermano\nmenor' },
      ],
    };
    const csv = exportBundle(source).find(e => e.name === 'csv/Persona.csv')!.data as string;
    const table = parseCsv(csv);
    const result = importCsvRows(p, 'persona', table, guessMapping(p, 'persona', table.header));
    expect(result).toMatchObject({ created: 2, skipped: 0, unplaced: 0 });
    const [ana, luis] = result.project.nodes;
    expect(nodeLabel(result.project, ana)).toBe('Ana; "la mayor"');
    expect(ana.values).toMatchObject({ edad: 30, viva: true });
    expect(luis).toMatchObject({ parentId: ana.id, notes: 'Hermano\nmenor', values: { viva: false } });
  });
});
