import { describe, expect, it } from 'vitest';
import { project } from '../test/fixtures';
import { tableColumns } from './database';
import { importDocumentCollections, inferShape, parseDocuments, sampleCollection } from './documentImport';
import { mongoScript } from './mongoScript';

const PEDIDOS = [
  '{"_id":{"$oid":"6530a1f1c2a4b1e2f3a4b5c1"},"cliente_id":{"$oid":"6530a1f1c2a4b1e2f3a4b501"},"fecha":{"$date":"2026-10-01T10:00:00Z"},"estado":"abierto","total":{"$numberDecimal":"12.50"},"envio":{"calle":"Mayor 1","cp":"28001"},"lineas":[{"producto":"A1","cantidad":2},{"producto":"B2","cantidad":1}],"etiquetas":["urgente"]}',
  '{"_id":{"$oid":"6530a1f1c2a4b1e2f3a4b5c2"},"cliente_id":{"$oid":"6530a1f1c2a4b1e2f3a4b502"},"fecha":{"$date":"2026-10-02T10:00:00Z"},"estado":"cerrado","total":{"$numberDecimal":"7"},"envio":{"calle":"Sol 2","cp":"28002"},"lineas":[{"producto":"C3","cantidad":5}]}',
  '{"_id":{"$oid":"6530a1f1c2a4b1e2f3a4b5c3"},"cliente_id":{"$oid":"6530a1f1c2a4b1e2f3a4b501"},"fecha":{"$date":"2026-10-03T10:00:00Z"},"estado":"abierto","total":{"$numberDecimal":"3.10"},"envio":{"calle":"Luna 3","cp":"28003"},"lineas":[],"nota":"llamar antes"}',
].join('\n');
const CLIENTES =
  '[{"_id":{"$oid":"6530a1f1c2a4b1e2f3a4b501"},"nombre":"Ana","edad":31},{"_id":{"$oid":"6530a1f1c2a4b1e2f3a4b502"},"nombre":"Bruno","edad":40.5}]';

describe('importar colecciones de documentos', () => {
  it('lee JSON, un documento por línea, lo que escribe mongosh y varias colecciones a la vez', () => {
    expect(parseDocuments(CLIENTES)).toEqual({ documents: JSON.parse(CLIENTES) });
    expect((parseDocuments(PEDIDOS) as { documents: unknown[] }).documents).toHaveLength(3);
    const shell =
      "{ _id: ObjectId('6530a1f1c2a4b1e2f3a4b501'), nombre: 'D\\'Ana', alta: ISODate('2026-10-01T00:00:00Z') }";
    expect(parseDocuments(shell)).toEqual({
      documents: [
        { _id: { $oid: '6530a1f1c2a4b1e2f3a4b501' }, nombre: "D'Ana", alta: { $date: '2026-10-01T00:00:00Z' } },
      ],
    });
    expect(parseDocuments('{"clientes":[{"a":1}],"pedidos":[{"b":2}]}')).toEqual({
      collections: { clientes: [{ a: 1 }], pedidos: [{ b: 2 }] },
    });
    expect(() => parseDocuments('esto no es JSON')).toThrow(/No se entiende/);
  });

  it('deduce tipos, obligatorios, opciones y lo que va dentro', () => {
    const shape = inferShape((parseDocuments(PEDIDOS) as { documents: unknown[] }).documents);
    const byKey = Object.fromEntries(shape.fields.map(f => [f.key, f]));
    expect(Object.keys(byKey)).not.toContain('_id');
    expect(byKey.cliente_id).toMatchObject({ kind: 'objectId', required: true });
    expect(byKey.fecha).toMatchObject({ kind: 'date', required: true });
    expect(byKey.total).toMatchObject({ kind: 'decimal' });
    expect(byKey.nota).toMatchObject({ kind: 'string', required: false });
    expect(byKey.envio.shape!.fields.map(f => f.key)).toEqual(['calle', 'cp']);
    expect(byKey.lineas).toMatchObject({ kind: 'array', items: 'object' });
    expect(byKey.lineas.shape!.fields.find(f => f.key === 'cantidad')).toMatchObject({ kind: 'int', required: true });
    expect(byKey.etiquetas).toMatchObject({ kind: 'array', items: 'string', required: false });
    // Con seis o más textos y pocos valores distintos, una lista de opciones.
    const states = inferShape(['a', 'b', 'a', 'b', 'a', 'a'].map(estado => ({ estado })));
    expect(states.fields[0].options).toEqual(['a', 'b']);
    // Enteros y decimales mezclados son decimales; sin avisar.
    const ages = inferShape(JSON.parse(CLIENTES));
    expect(ages.fields.find(f => f.key === 'edad')).toMatchObject({ kind: 'double' });
  });

  it('crea las colecciones con sus subdocumentos y la referencia al cliente', () => {
    const pedidos = sampleCollection('pedidos', (parseDocuments(PEDIDOS) as { documents: unknown[] }).documents);
    const clientes = sampleCollection('clientes', JSON.parse(CLIENTES));
    const {
      project: p,
      created,
      subdocuments,
    } = importDocumentCollections(project(), [pedidos, clientes], {
      engine: 'mongodb',
      baseTypeId: null,
    });
    expect(created).toEqual(['pedidos', 'clientes']);
    expect(subdocuments).toBe(2);
    const pedido = p.schemas.find(s => s.name === 'pedidos')!;
    const columns = Object.fromEntries(tableColumns(p, pedido.id).map(c => [c.field.key, c]));
    expect(columns.cliente_id).toMatchObject({ refKind: 'reference', docType: 'objectId' });
    expect(columns.cliente_id.target?.name).toBe('clientes');
    expect(columns.envio).toMatchObject({ refKind: 'embedded', docType: 'object' });
    expect(columns.lineas).toMatchObject({ refKind: 'embedded', docType: 'array' });
    expect(columns.total.docType).toBe('decimal');
    expect(columns.fecha.docType).toBe('date');
    expect(columns.etiquetas.field.type).toBe('tags');
    // El script de mongosh pide lo obligatorio y valida los tipos.
    const script = mongoScript(p);
    expect(script).toMatch(/"required":\s*\[[^\]]*"cliente_id"/);
    expect(script).toContain('"decimal"');
  });
});
