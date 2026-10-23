import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { field, node, project, schema } from '../test/fixtures';
import { isEmbeddedType, isTableType } from './database';
import { convertToDocuments, suggestConversion } from './documentConversion';
import { removeNodes } from './operations';
import { scriptTables, sqlScript } from './sqlScript';
import { convertToTables, documentCollections, suggestTables } from './tableConversion';
import type { Project } from './types';

/** Un pedido de MongoDB con su dirección de envío (objeto) y sus líneas (lista) dentro, y sus etiquetas (ids). */
function orders(): Project {
  return project({
    schemas: [
      schema('direccion', { table: true, dbEngine: 'mongodb', embedded: true, fields: [field('calle'), field('cp')] }),
      schema('linea', {
        table: true,
        dbEngine: 'mongodb',
        embedded: true,
        fields: [field('producto'), field('cantidad', { type: 'number' })],
      }),
      schema('etiqueta', { table: true, dbEngine: 'mongodb', fields: [field('nombre', { isTitle: true })] }),
      schema('pedido', {
        table: true,
        dbEngine: 'mongodb',
        fields: [
          field('titulo', { isTitle: true }),
          field('estado'),
          field('envio', { type: 'nodeRef', referenceTypeIds: ['direccion'] }),
          field('lineas', { type: 'nodeRefs', referenceTypeIds: ['linea'] }),
          field('etiquetas', { type: 'nodeRefs', referenceTypeIds: ['etiqueta'] }),
        ],
      }),
    ],
    nodes: [
      node('n-pedido', 'pedido', null, { titulo: 'pedidos', etiquetas: ['n-etiqueta'] }),
      node('n-etiqueta', 'etiqueta', null, { nombre: 'etiquetas' }),
    ],
  });
}

describe('pasar documentos a tablas', () => {
  it('sugiere aplanar el objeto pequeño y hacer tabla la lista', () => {
    const p = orders();
    const byName = Object.fromEntries(
      suggestTables(
        p,
        documentCollections(p).map(n => n.id),
      ).map(s => [s.name, s]),
    );
    expect(byName.direccion).toMatchObject({ flatten: true, canFlatten: true });
    expect(byName.direccion.reason).toMatch(/columnas de pedido/);
    expect(byName.linea).toMatchObject({ flatten: false, canFlatten: false });
    expect(byName.linea.reason).toMatch(/clave foránea hacia pedido/);
  });

  it('convierte: columnas aplanadas, tabla hija con su clave foránea y tabla intermedia', () => {
    const p = orders();
    const { project: next, warnings } = convertToTables(p, 'sqlserver', {
      nodeIds: documentCollections(p).map(n => n.id),
      flatten: {},
      junctions: true,
    });
    expect(warnings).toEqual([]);
    expect(isTableType(next, 'pedido')).toBe(true);
    expect(isEmbeddedType(next, 'linea')).toBe(false);
    expect(next.schemas.some(s => s.id === 'direccion')).toBe(false);
    const tables = Object.fromEntries(scriptTables(next).map(t => [t.name, t.columns.map(c => c.name)]));
    expect(tables.pedidos).toEqual(['id', 'estado', 'envio_calle', 'envio_cp']);
    expect(tables.linea).toEqual(['id', 'pedido_id', 'producto', 'cantidad']);
    // Las etiquetas (una lista de ids) pasan a una tabla intermedia.
    expect(Object.keys(tables).length).toBe(4);
    const script = sqlScript(next);
    expect(script).toMatch(
      /FOREIGN KEY \(\[pedido_id\]\) REFERENCES \[dbo\]\.\[pedidos\] \(\[id\]\) ON DELETE CASCADE/,
    );
  });

  it('sin tablas intermedias, avisa', () => {
    const p = orders();
    const { warnings } = convertToTables(p, 'db2i', {
      nodeIds: ['n-pedido', 'n-etiqueta'],
      flatten: { direccion: false },
      junctions: false,
    });
    expect(warnings[0]).toMatch(/1 lista de referencias necesita una tabla intermedia/);
  });

  it('de tablas a documentos y vuelta: las líneas vuelven a ser una tabla de su pedido', () => {
    const tablesFirst = removeNodes(commercialCase(), new Set(['n-devolucion']));
    const ids = tablesFirst.nodes.map(n => n.id);
    const docs = convertToDocuments(
      tablesFirst,
      'mongodb',
      suggestConversion(tablesFirst, ids).map(s => ({ nodeId: s.nodeId, embed: s.embed })),
    ).project;
    const back = convertToTables(docs, 'sqlserver', {
      nodeIds: documentCollections(docs).map(n => n.id),
      flatten: {},
      junctions: true,
    }).project;
    const linea = scriptTables(back).find(t => t.node.typeId === 'linea')!;
    expect(linea.columns.filter(c => c.sql.primaryKey).map(c => c.name)).toEqual(['pedido_id', 'numero']);
    expect(sqlScript(back)).toMatch(/REFERENCES \[dbo\]\.\[Pedido\] \(\[pedido_id\]\) ON DELETE CASCADE/);
  });
});
