import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../services/storage';
import { commercialCase } from '../test/commercialCase';
import { foreignKeyLinks, tableColumns, tableIssues, type SqlColumn } from './database';
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
    expect(script.match(/FOREIGN KEY/g)).toHaveLength(7);
    // Ampliaciones: DEFAULT, regla de la FK e índice.
    expect(script).toContain('[fecha] date NOT NULL CONSTRAINT [DF_Pedido_fecha] DEFAULT (GETDATE())');
    expect(script).toMatch(
      /FOREIGN KEY \(\[linea_pedido\]\) REFERENCES \[dbo\]\.\[Pedido\] \(\[pedido_id\]\) ON DELETE CASCADE;/,
    );
    expect(script).toContain('CREATE INDEX [IX_Pedido_pedido_cliente] ON [dbo].[Pedido] ([pedido_cliente]);');
    // UNIQUE compuesta por grupo.
    expect(script).toContain('CONSTRAINT [UQ_Pedido_cliente_fecha] UNIQUE ([pedido_cliente], [fecha])');
    // Una referencia a una clave compuesta: una columna por cada parte y una FK de varias columnas.
    expect(script).toContain('[devuelta_linea_pedido] int NOT NULL');
    expect(script).toContain('[devuelta_numero] int NOT NULL');
    expect(script).toContain(
      'FOREIGN KEY ([devuelta_linea_pedido], [devuelta_numero]) REFERENCES [dbo].[LineaPedido] ([linea_pedido], [numero]);',
    );
    expect(script).toContain(
      'CREATE INDEX [IX_Devolucion_devuelta] ON [dbo].[Devolucion] ([devuelta_linea_pedido], [devuelta_numero]);',
    );
    expect(tableIssues(commercialCase(), 'devolucion')).toEqual([]);
  });

  it('avisa de las reglas y los valores por defecto que SQL Server rechazaría', () => {
    const p = commercialCase();
    const withSql = (typeId: string, fieldId: string, patch: Partial<SqlColumn>) => ({
      ...p,
      schemas: p.schemas.map(s =>
        s.id !== typeId
          ? s
          : {
              ...s,
              fields: s.fields.map(f => ('ref' in f || f.id !== fieldId ? f : { ...f, sql: { ...f.sql!, ...patch } })),
            },
      ),
    });
    // Cascada en una autorreferencia: error del lint.
    expect(
      databaseLint(withSql('empleado', 'jefe', { onDelete: 'CASCADE' })).filter(i => i.severity === 'error'),
    ).toEqual([expect.objectContaining({ message: expect.stringContaining('ciclo o una autorreferencia') })]);
    // SET NULL en una columna que no admite nulos, SET DEFAULT sin valor y un DEFAULT que rompería el script.
    const messages = (patch: Partial<SqlColumn>) =>
      tableIssues(withSql('pedido', 'pedido_cliente', patch), 'pedido').map(i => i.message);
    expect(messages({ onDelete: 'SET NULL' })).toEqual([expect.stringContaining('admita nulos')]);
    expect(messages({ onUpdate: 'SET DEFAULT' })).toEqual([expect.stringContaining('valor por defecto')]);
    expect(messages({ defaultValue: '1; DROP TABLE x' })).toEqual([expect.stringContaining('«;»')]);
    expect(messages({ defaultValue: "N'abierto" })).toEqual([expect.stringContaining('comillas')]);
    // Los metadatos nuevos sobreviven a la ida y vuelta por JSON.
    const back = parseProject(serializeProject(p)).project;
    expect(sqlScript(back, DATE)).toContain('ON DELETE CASCADE');
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
    expect(script.match(/FOREIGN KEY/g)).toHaveLength(9);
    expect(databaseLint(next).filter(i => i.severity === 'error')).toEqual([]);
  });
});
