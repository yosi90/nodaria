import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { engineOf, isEmbeddedType, tableColumns } from './database';
import { convertToDocuments, suggestConversion } from './documentConversion';
import { mongoScript } from './mongoScript';
import { removeNodes } from './operations';
import { addRows } from './tableData';
import type { Project } from './types';

/** La tienda sin las devoluciones (que apuntan a las líneas: con ellas, las líneas no se pueden incrustar). */
const shop = (): Project => removeNodes(commercialCase(), new Set(['n-devolucion']));
const all = (p: Project) => p.nodes.map(n => n.id);

describe('pasar tablas a documentos', () => {
  it('sugiere incrustar las líneas en su pedido y dejar como colecciones lo que se comparte', () => {
    const p = shop();
    const byName = Object.fromEntries(suggestConversion(p, all(p)).map(s => [s.name, s]));
    expect(byName.LineaPedido).toMatchObject({ embed: true, parent: { name: 'Pedido', many: true } });
    expect(byName.LineaPedido.reason).toMatch(/clave primaria/);
    expect(byName.Cliente).toMatchObject({ embed: false });
    expect(byName.Cliente.reason).toMatch(/La apunta Pedido/);
    expect(byName.Pedido.embed).toBe(false);
    expect(byName.Pedido.reason).toBe('Es una colección; LineaPedido va dentro.');
    expect(byName.Empleado.embed).toBe(false);
    // Con las devoluciones, las líneas las apunta otra tabla: colección.
    const full = commercialCase();
    const linea = suggestConversion(full, all(full)).find(s => s.name === 'LineaPedido')!;
    expect(linea).toMatchObject({ embed: false });
    expect(linea.reason).toMatch(/Devolucion/);
  });

  it('convierte: el subdocumento, la lista en el padre y las referencias', () => {
    let p = shop();
    p = addRows(p, 'n-cliente', ['r1']);
    const choices = suggestConversion(p, all(p)).map(s => ({ nodeId: s.nodeId, embed: s.embed }));
    const { project, embedded, warnings } = convertToDocuments(p, 'mongodb', choices);
    expect(embedded).toBe(1);
    expect(warnings[0]).toBe('La fila de ejemplo de estas tablas no pasa a los documentos.');
    expect(project.tableData).toEqual({});
    expect(engineOf(project, 'pedido')).toBe('mongodb');
    expect(isEmbeddedType(project, 'linea')).toBe(true);
    // La tabla de las líneas ya no es un nodo, y su clave hacia el pedido sobra.
    expect(project.nodes.some(n => n.id === 'n-linea')).toBe(false);
    expect(tableColumns(project, 'linea').map(c => c.field.key)).not.toContain('linea_pedido');
    const lineas = tableColumns(project, 'pedido').find(c => c.field.key === 'lineapedido')!;
    expect(lineas).toMatchObject({ refKind: 'embedded', docType: 'array' });
    const cliente = tableColumns(project, 'pedido').find(c => c.field.key === 'pedido_cliente')!;
    expect(cliente).toMatchObject({ refKind: 'reference', docType: 'objectId' });
    const script = mongoScript(project);
    expect(script).toContain('lineapedido');
    expect(script).toContain('"Pedido"');
  });

  it('dejarla como colección aunque se sugiera incrustarla', () => {
    const p = shop();
    const { project, embedded } = convertToDocuments(
      p,
      'firestore',
      all(p).map(nodeId => ({ nodeId, embed: false })),
    );
    expect(embedded).toBe(0);
    expect(isEmbeddedType(project, 'linea')).toBe(false);
    expect(engineOf(project, 'linea')).toBe('firestore');
    expect(project.nodes).toHaveLength(p.nodes.length);
  });
});
