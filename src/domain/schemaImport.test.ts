import { describe, expect, it } from 'vitest';
import { commercialCase } from '../test/commercialCase';
import { field, project, schema } from '../test/fixtures';
import { sqlTypeText } from './database';
import { db2Script, db2Sources } from './db2Script';
import { guessDialect, isDds, mergeResults, parseDds, parseSqlDdl } from './schemaImport';
import { scriptTables, sqlScript } from './sqlScript';
import { importPreview, importTables } from './tablesImport';
import { dataTables } from './tableData';
import type { Project } from './types';

/** Lo esencial de las tablas de un proyecto, para comparar dos: columnas con su tipo, claves y destinos. */
const shape = (p: Project) =>
  dataTables(p)
    .map(t => ({
      name: t.name,
      columns: t.columns.map(c => [
        c.name,
        sqlTypeText(c.type),
        c.sql.primaryKey ? 'PK' : '',
        c.sql.nullable && !c.sql.primaryKey ? 'NULL' : '',
        c.sql.identity ? 'ID' : '',
        c.fk ? `→${dataTables(p).find(x => x.node.id === c.fk!.nodeId)?.name}` : '',
      ]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const db2 = (p: Project): Project => ({
  ...p,
  schemas: p.schemas.map(s => (s.table ? { ...s, dbEngine: 'db2i' } : s)),
});

const SSMS = `
USE [Tienda]
GO
/****** Object:  Table [dbo].[Cliente] ******/
SET ANSI_NULLS ON
GO
CREATE TABLE [dbo].[Cliente](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[nombre] [nvarchar](100) NOT NULL,
	[email] [varchar](200) NULL,
	[alta] [datetime] NOT NULL CONSTRAINT [DF_Cliente_alta] DEFAULT (getdate()),
	[notas] [ntext] NULL,
 CONSTRAINT [PK_Cliente] PRIMARY KEY CLUSTERED
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
CREATE TABLE [dbo].[Pedido](
	[id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
	[cliente] [int] NOT NULL,
	[estado] [nvarchar](20) NOT NULL CHECK ([estado] IN (N'Abierto', N'Cerrado')),
	[importe] [decimal](10, 2) NULL
)
GO
ALTER TABLE [dbo].[Pedido]  WITH CHECK ADD  CONSTRAINT [FK_Pedido_Cliente] FOREIGN KEY([cliente])
REFERENCES [dbo].[Cliente] ([id])
ON DELETE CASCADE
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Cliente_email] ON [dbo].[Cliente] ([email] ASC)
GO
EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'Cuándo se dio de alta' , @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Cliente', @level2type=N'COLUMN',@level2name=N'alta'
GO
`;

describe('importar tablas', () => {
  it('lee un script de SQL Server Management Studio', () => {
    expect(guessDialect(SSMS)).toBe('sqlserver');
    const result = parseSqlDdl(SSMS, 'sqlserver');
    const [cliente, pedido] = result.tables;
    expect(result.tables.map(t => t.name)).toEqual(['Cliente', 'Pedido']);
    expect(cliente.columns.map(c => [c.name, sqlTypeText(c.type), c.nullable, c.identity])).toEqual([
      ['id', 'int', false, true],
      ['nombre', 'nvarchar(100)', false, false],
      ['email', 'varchar(200)', true, false],
      ['alta', 'datetime', false, false],
      ['notas', 'nvarchar(max)', true, false],
    ]);
    expect(cliente.primaryKey).toEqual(['id']);
    expect(cliente.uniques).toEqual([['email']]);
    expect(cliente.columns[3]).toMatchObject({ defaultValue: 'getdate()', description: 'Cuándo se dio de alta' });
    expect(cliente.warnings).toEqual(['notas: NTEXT se lee como nvarchar(max).']);
    expect(pedido.primaryKey).toEqual(['id']);
    expect(pedido.columns[2].options).toEqual(['Abierto', 'Cerrado']);
    expect(pedido.foreignKeys).toEqual([
      { columns: ['cliente'], table: 'Cliente', targetColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
    ]);
  });

  it('el script de SQL Server de Nodaria vuelve igual', () => {
    const original = commercialCase();
    const result = parseSqlDdl(sqlScript(original), 'sqlserver');
    expect(result.warnings).toEqual([]);
    const imported = importTables(project(), result, {
      tables: result.tables.map(t => t.name),
      baseTypeId: null,
    }).project;
    expect(shape(imported)).toEqual(shape(original));
  });

  it('el script de Db2 de Nodaria vuelve igual, con las etiquetas', () => {
    const original = db2(commercialCase());
    const text = db2Script(original);
    expect(guessDialect(text)).toBe('db2i');
    const result = parseSqlDdl(text, 'db2i');
    const imported = importTables(project(), result, {
      tables: result.tables.map(t => t.name),
      baseTypeId: null,
    }).project;
    expect(shape(imported)).toEqual(shape(original));
    expect(result.tables.find(t => t.name === 'CLIENTE')?.description).toBe('Cliente');
  });

  it('lee el DDS de un archivo físico y uno lógico', () => {
    const pf = [
      '     A                                      UNIQUE',
      "     A          R CLIENTER                  TEXT('Clientes')",
      "     A            CLICOD         7P 0       TEXT('Código de cliente')",
      "     A            CLINOM        40A         COLHDG('Nombre' 'del +",
      "     A                                      cliente')",
      '     A            CLISAL        11S 2       ALWNULL',
      "     A            CLIALT          L         DFT('2026-01-01')",
      '     A            CLITIP         1B 0',
      '     A          K CLICOD',
    ].join('\n');
    const lf = ['     A          R CLIENTER                  PFILE(CLIENTES)', '     A          K CLINOM'].join('\n');
    expect(isDds(pf)).toBe(true);
    expect(guessDialect(pf)).toBe('db2i');
    const result = mergeResults([parseDds(pf, 'CLIENTES'), parseDds(lf, 'CLIENTL1')], 'db2i');
    const [t] = result.tables;
    expect(t.name).toBe('CLIENTES');
    expect(t.description).toBe('Clientes');
    expect(t.columns.map(c => [c.name, sqlTypeText(c.type), c.nullable, c.description])).toEqual([
      ['CLICOD', 'DECIMAL(7,0)', false, 'Código de cliente'],
      ['CLINOM', 'CHAR(40)', false, 'Nombre del cliente'],
      ['CLISAL', 'NUMERIC(11,2)', true, ''],
      ['CLIALT', 'DATE', false, ''],
      ['CLITIP', 'SMALLINT', false, ''],
    ]);
    expect(t.columns[3].defaultValue).toBe("'2026-01-01'");
    expect(t.primaryKey).toEqual(['CLICOD']);
    expect(t.indexes).toEqual([['CLINOM']]);
  });

  it('lee los PF que genera Nodaria', () => {
    const original = db2(commercialCase());
    const files = db2Sources(original, new Date(), { sql: false, dds: true }).filter(f => f.path.endsWith('.pf'));
    const result = mergeResults(
      files.map(f => parseDds(f.text, f.path.split('/').pop()!.split('.')[0])),
      'db2i',
    );
    const cliente = result.tables.find(t => t.name === 'CLIENTE')!;
    expect(cliente.primaryKey).toEqual(['CLIENTE_ID']);
    expect(cliente.columns.map(c => c.name)).toEqual(['CLIENTE_ID', 'CLIENTENOM', 'CLIENTEEMA']);
  });

  it('crea los tipos bajo el tipo base y enlaza con las tablas que ya están', () => {
    const base = schema('archivo', {
      table: true,
      dbEngine: 'sqlserver',
      isAbstract: true,
      fields: [field('nombre_tabla', { isTitle: true })],
    });
    let p = importTables(
      project({ schemas: [base] }),
      parseSqlDdl('CREATE TABLE Cliente (id int PRIMARY KEY)', 'sqlserver'),
      {
        tables: ['Cliente'],
        baseTypeId: 'archivo',
      },
    ).project;
    const result = parseSqlDdl(SSMS, 'sqlserver');
    expect(importPreview(p, result).map(x => [x.table.name, x.exists])).toEqual([
      ['Cliente', true],
      ['Pedido', false],
    ]);
    const done = importTables(p, result, { tables: ['Cliente', 'Pedido'], baseTypeId: 'archivo' });
    p = done.project;
    expect(done.created).toEqual(['Pedido']);
    const pedido = p.schemas.find(s => s.name === 'Pedido')!;
    expect(pedido).toMatchObject({ parentTypeId: 'archivo', dbEngine: null, table: true });
    const node = p.nodes.find(n => n.typeId === pedido.id)!;
    expect(node.values.nombre_tabla).toBe('Pedido');
    const tables = scriptTables(p);
    const fk = tables.find(t => t.name === 'Pedido')!.columns.find(c => c.name === 'cliente')!;
    expect(fk.field.type).toBe('nodeRef');
    expect(node.values[fk.field.id]).toBe(p.nodes.find(n => n.values.nombre_tabla === 'Cliente')!.id);
    expect(fk.sql.onDelete).toBe('CASCADE');
    expect(sqlScript(p)).toContain('REFERENCES [dbo].[Cliente] ([id]) ON DELETE CASCADE;');
  });
});
