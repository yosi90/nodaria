import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../services/storage';
import { commercialCase } from '../test/commercialCase';
import { foreignKeyLinks, tableColumns, tableIssues } from './database';
import { databaseLint, foreignKeyCycles } from './databaseLint';
import { createJunctionTables, junctionProposals } from './junctionTables';
import { sqlScript } from './sqlScript';

const DATE = new Date('2026-10-17T00:00:00.000Z');

describe('caso comercial (hito 5)', () => {
  it('declara las claves foráneas, la clave compuesta, la autorreferencia y el ciclo', () => {
    const p = commercialCase();
    const links = foreignKeyLinks(p).map(l => `${l.sourceId}→${l.targetId}`);
    expect(links).toEqual(
      expect.arrayContaining([
        'n-pedido→n-cliente',
        'n-linea→n-pedido',
        'n-linea→n-producto',
        'n-departamento→n-empleado',
        'n-empleado→n-departamento',
        'n-empleado→n-empleado',
      ]),
    );
    expect(
      tableColumns(p, 'linea')
        .filter(c => c.sql.primaryKey)
        .map(c => c.field.key),
    ).toEqual(['linea_pedido', 'numero']);
    // El ciclo existe, y como el responsable admite nulos, es un aviso y no un error.
    expect(foreignKeyCycles(p)).toEqual([expect.arrayContaining(['n-departamento', 'n-empleado'])]);
    expect(databaseLint(p).filter(i => i.severity === 'error')).toEqual([]);
    // La referencia múltiple de Producto queda fuera de la tabla (por defecto) y se propone como tabla intermedia.
    expect(tableIssues(p, 'producto')).toEqual([]);
    expect(junctionProposals(p)).toHaveLength(1);
  });

  it('genera el script de SQL Server con PK compuesta, UNIQUE, nulos y las FK', () => {
    const script = sqlScript(commercialCase(), DATE);
    expect(script).toContain('CREATE TABLE [dbo].[LineaPedido]');
    expect(script).toMatch(/PRIMARY KEY \(\[linea_pedido\], \[numero\]\)/);
    expect(script).toMatch(/\[cliente_email\] nvarchar\(200\) NULL/);
    expect(script).toMatch(/UNIQUE \(\[sku\]\)/);
    expect(script).toMatch(/\[precio\] decimal\(10,2\) NOT NULL/);
    expect(script).toMatch(/FOREIGN KEY \(\[jefe\]\) REFERENCES \[dbo\]\.\[Empleado\]/);
    // Los valores limitados de una lista, como CHECK.
    expect(script).toContain("CONSTRAINT [CK_Pedido_estado] CHECK ([estado] IN (N'Abierto', N'Enviado', N'Cerrado'))");
    expect(script.match(/FOREIGN KEY/g)).toHaveLength(6);
  });

  it('sobrevive a exportar e importar el JSON sin cambiar el esquema ni el script', () => {
    const p = commercialCase();
    const { project: back, issues } = parseProject(serializeProject(p));
    expect(issues).toEqual([]);
    expect(sqlScript(back, DATE)).toBe(sqlScript(p, DATE));
    expect(foreignKeyLinks(back)).toEqual(foreignKeyLinks(p));
  });

  it('propone y crea la tabla intermedia de la referencia múltiple (hito 4)', () => {
    const p = commercialCase();
    const proposals = junctionProposals(p);
    expect(proposals).toEqual([
      { sourceId: 'n-producto', fieldId: 'proveedores', targetId: 'n-proveedor', name: 'Producto_Proveedor' },
    ]);
    const next = createJunctionTables(p, [{ ...proposals[0], name: 'ProductoProveedor' }], true);
    const junction = next.schemas.at(-1)!;
    expect(junction).toMatchObject({ name: 'ProductoProveedor', table: true });
    expect(tableColumns(next, junction.id).map(c => [c.field.key, c.sql.primaryKey])).toEqual([
      ['id_producto', true],
      ['id_proveedor', true],
    ]);
    // La relación pasa a la tabla intermedia: la referencia múltiple se queda sin ese destino.
    expect(next.nodes.find(n => n.id === 'n-producto')!.values.proveedores).toBeUndefined();
    expect(tableIssues(next, 'producto')).toEqual([]);
    const script = sqlScript(next, DATE);
    expect(script).toContain('CREATE TABLE [dbo].[ProductoProveedor]');
    expect(script).toMatch(/PRIMARY KEY \(\[id_producto\], \[id_proveedor\]\)/);
    expect(script.match(/FOREIGN KEY/g)).toHaveLength(8);
    expect(databaseLint(next).filter(i => i.severity === 'error')).toEqual([]);
  });
});
