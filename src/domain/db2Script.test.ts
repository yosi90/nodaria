import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import {
  convertType,
  foreignKeyLinks,
  sqlType,
  sqlTypeError,
  sqlTypeText,
  tableColumns,
  tableIssues,
  type SqlColumn,
} from './database';
import { db2Model, db2Name, db2Script, db2Sources, systemNames, wrapSql } from './db2Script';
import { sqlScript } from './sqlScript';
import type { Project } from './types';

const id: SqlColumn = {
  type: sqlType('INTEGER'),
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
};

/** Un pedido de un cliente, en Db2 for i, con nombres largos, una lista de opciones y una descripción. */

function shop(): Project {
  return project({
    name: 'Gestión de pedidos',
    schemas: [
      schema('cliente', {
        table: true,
        dbEngine: 'db2i',
        fields: [
          field('titulo', { isTitle: true }),
          field('id', { sql: id }),
          field('nombre_completo', {
            label: 'Nombre completo',
            required: true,
            description: 'El nombre tal como aparece en la factura del cliente',
          }),
          field('alta', { type: 'date', label: 'Fecha de alta' }),
        ],
      }),
      schema('pedido', {
        table: true,
        dbEngine: 'db2i',
        fields: [
          field('titulo2', { isTitle: true }),
          field('numero', { sql: { ...id, identity: false, type: sqlType('DECIMAL', null, 9, 0) } }),
          field('cliente_ref', {
            type: 'nodeRef',
            key: 'cliente',
            referenceTypeIds: ['cliente'],
            sql: { ...id, type: null, primaryKey: false, identity: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
          }),
          field('estado', { type: 'select', options: ['Abierto', 'Enviado'] }),
          field('importe', {
            type: 'number',
            sql: { ...id, primaryKey: false, identity: false, type: sqlType('decimal', null, 11, 2), indexed: true },
          }),
        ],
      }),
      schema('factura_sql', {
        table: true,
        fields: [
          field('titulo3', { isTitle: true }),
          field('cliente_sql', { type: 'nodeRef', referenceTypeIds: ['cliente'] }),
        ],
      }),
    ],
    nodes: [
      node('n-cliente', 'cliente', null, { titulo: 'Clientes de facturación' }),
      node('n-pedido', 'pedido', null, { titulo2: 'Pedidos', cliente_ref: 'n-cliente' }),
      node('n-factura', 'factura_sql', null, { titulo3: 'Facturas', cliente_sql: 'n-cliente' }),
    ],
  });
}

const GENERATED = new Date('2026-10-23T12:00:00Z');

describe('tipos de Db2 for i', () => {
  it('convierte entre SQL Server y Db2 en los dos sentidos', () => {
    const db2 = (type: Parameters<typeof convertType>[0]) => sqlTypeText(convertType(type, 'db2i'));
    expect(db2(sqlType('int'))).toBe('INTEGER');
    expect(db2(sqlType('nvarchar', 80))).toBe('VARCHAR(80)');
    expect(db2(sqlType('nvarchar', 'max'))).toBe('CLOB(1M)');
    expect(db2(sqlType('bit'))).toBe('SMALLINT');
    expect(db2(sqlType('datetime2'))).toBe('TIMESTAMP');
    expect(db2(sqlType('money'))).toBe('DECIMAL(19,4)');
    expect(db2(sqlType('uniqueidentifier'))).toBe('CHAR(36)');
    const back = (type: Parameters<typeof convertType>[0]) => sqlTypeText(convertType(type, 'sqlserver'));
    expect(back(sqlType('NUMERIC', null, 9, 2))).toBe('numeric(9,2)');
    expect(back(sqlType('VARCHAR', 20000))).toBe('varchar(max)');
    expect(back(sqlType('BOOLEAN'))).toBe('bit');
    expect(back(sqlType('TIMESTAMP'))).toBe('datetime2');
  });

  it('valida los límites de Db2', () => {
    expect(sqlTypeError(sqlType('DECIMAL', null, 63, 2))).toBeNull();
    expect(sqlTypeError(sqlType('DECIMAL', null, 64, 2))).toMatch(/1 a 63/);
    expect(sqlTypeError(sqlType('VARCHAR', 32741))).toMatch(/32740/);
    expect(sqlTypeText(sqlType('TIMESTAMP', null, undefined, 12))).toBe('TIMESTAMP(12)');
    expect(sqlTypeText(sqlType('TIMESTAMP'))).toBe('TIMESTAMP');
  });

  it('deduce las columnas de una tabla de Db2 y las del tipo de SQL Server las convierte', () => {
    const columns = tableColumns(shop(), 'pedido');
    const type = (key: string) => sqlTypeText(columns.find(c => c.field.key === key)!.type);
    expect(type('numero')).toBe('DECIMAL(9,0)');
    expect(type('importe')).toBe('DECIMAL(11,2)');
    expect(type('estado')).toBe('VARCHAR(50)');
    // La clave foránea toma el tipo de la clave del cliente.
    expect(type('cliente')).toBe('INTEGER');
  });

  it('no une con clave foránea una tabla de SQL Server con una de Db2', () => {
    const links = foreignKeyLinks(shop());
    expect(links.map(l => l.sourceId)).toEqual(['n-pedido']);
    expect(sqlScript(shop())).not.toContain('CREATE TABLE [dbo].[Clientes');
  });

  it('avisa de lo que Db2 for i no admite', () => {
    const issues = tableIssues(shop(), 'pedido').map(i => i.message);
    expect(issues.some(m => /solo admite NO ACTION al actualizar/.test(m))).toBe(true);
  });
});

describe('nombres de IBM i', () => {
  it('pasa los nombres a identificadores ordinarios y da nombres de sistema de 10', () => {
    expect(db2Name('Fecha de alta')).toBe('FECHA_DE_ALTA');
    expect(db2Name('Año contable')).toBe('ANO_CONTABLE');
    expect(db2Name('2026')).toBe('T_2026');
    expect(systemNames(['NOMBRE_COMPLETO', 'NOMBRE_COMPROBADO', 'ID'])).toEqual(['NOMBRECOMP', 'NOMBRECO01', 'ID']);
  });
});

describe('script de Db2 for i', () => {
  it('crea las tablas con nombres de sistema, IDENTITY, claves y etiquetas', () => {
    const script = db2Script(shop(), GENERATED, { library: 'PEDIDOS' });
    expect(script).toContain('SET SCHEMA PEDIDOS;');
    expect(script).toContain('CREATE TABLE CLIENTES_DE_FACTURACION FOR SYSTEM NAME CLIENTESDE (');
    expect(script).toContain('ID INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1) NOT NULL');
    expect(script).toContain('NOMBRE_COMPLETO FOR COLUMN NOMBRECOMP VARCHAR(50) NOT NULL');
    expect(script).toContain("CHECK (ESTADO IN ('Abierto', 'Enviado'))");
    expect(script).toContain(
      'ALTER TABLE PEDIDOS ADD CONSTRAINT FK_PEDIDOS_CLIENTE FOREIGN KEY (CLIENTE) REFERENCES CLIENTES_DE_FACTURACION (ID) ON DELETE CASCADE;',
    );
    expect(script).toContain('no admite ON UPDATE CASCADE');
    expect(script).toContain("LABEL ON TABLE CLIENTES_DE_FACTURACION IS 'Clientes de facturación';");
    expect(script).toContain("NOMBRE_COMPLETO TEXT IS 'Nombre completo'");
    expect(script).toContain('CREATE INDEX PEDIDOS_IX ON PEDIDOS (IMPORTE);');
    // Las tablas de SQL Server no entran.
    expect(script).not.toContain('FACTURAS');
  });

  it('solo crea las tablas elegidas; las demás ya existen y sus claves desde las nuevas se crean', () => {
    const onlyOrders = db2Script(shop(), GENERATED, { tableIds: ['n-pedido'] });
    expect(onlyOrders).not.toContain('CREATE TABLE CLIENTES_DE_FACTURACION');
    expect(onlyOrders).toContain('CREATE TABLE PEDIDOS');
    expect(onlyOrders).toContain('-- CLIENTES_DE_FACTURACION ya existe en la biblioteca.');
    expect(onlyOrders).toContain('REFERENCES CLIENTES_DE_FACTURACION (ID)');
    const onlyClients = db2Script(shop(), GENERATED, { tableIds: ['n-cliente'] });
    expect(onlyClients).not.toContain('ALTER TABLE PEDIDOS');
  });
});

describe('miembros fuente', () => {
  it('parte el SQL en 80 columnas sin partir las cadenas', () => {
    const line = `    CONSTRAINT CK_X CHECK (ESTADO IN (${Array.from({ length: 12 }, (_, i) => `'Opción número ${i}'`).join(', ')}))`;
    const lines = wrapSql(line);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach(l => expect(l.length).toBeLessThanOrEqual(80));
    lines.forEach(l => expect((l.match(/'/g) ?? []).length % 2).toBe(0));
  });

  it('da miembros SQL, DDS, los CL y las órdenes de carga, todo en 80 columnas', () => {
    const files = db2Sources(shop(), GENERATED, { library: 'PEDIDOS', sql: true, dds: true, folder: '/tmp/ped' });
    const paths = files.map(f => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'QSQLSRC/CLIENTESDE.sql',
        'QSQLSRC/PEDIDOS.sql',
        'QSQLSRC/CLAVES.sql',
        'QSQLSRC/INDICES.sql',
        'QCLSRC/CRTSQL.clle',
        'QDDSSRC/CLIENTESDE.pf',
        'QDDSSRC/PEDIDOS.pf',
        'QDDSSRC/PEDIDOS_IX.lf',
        'QCLSRC/CRTDDS.clle',
        'CARGAR.sql',
      ]),
    );
    files
      .filter(f => f.path !== 'CARGAR.sql')
      .forEach(f => f.text.split('\r\n').forEach(l => expect(l.length, `${f.path}: ${l}`).toBeLessThanOrEqual(80)));
    const text = (path: string) => files.find(f => f.path === path)!.text;
    expect(text('QCLSRC/CRTSQL.clle')).toContain('SRCMBR(CLIENTESDE)');
    // Ningún comentario se parte sin «--» y la descripción va entera en su línea.
    text('QSQLSRC/CLIENTESDE.sql')
      .split('\r\n')
      .filter(l => /^\s+\d{4}-/.test(l))
      .forEach(l => expect(l).toMatch(/^\s*--/));
    expect(text('QSQLSRC/CLIENTESDE.sql')).toContain("    'El nombre tal como aparece en la factura del cliente';");
    expect(text('CARGAR.sql')).toContain(
      "CL: CPYFRMSTMF FROMSTMF('/tmp/ped/QSQLSRC/PEDIDOS.sql') TOMBR('/QSYS.LIB/PEDIDOS.LIB/QSQLSRC.FILE/PEDIDOS.MBR')",
    );
    expect(text('CARGAR.sql')).toContain('SRCTYPE(PF)');
  });

  it('escribe el DDS en sus columnas fijas', () => {
    const pf = db2Sources(shop(), GENERATED, { sql: false, dds: true })
      .find(f => f.path === 'QDDSSRC/PEDIDOS.pf')!
      .text.split('\r\n');
    const number = pf.find(l => l.slice(18, 28).trim() === 'NUMERO')!;
    expect(number[5]).toBe('A');
    expect(number.slice(29, 34)).toBe('    9');
    expect(number[34]).toBe('P');
    expect(number.slice(35, 37)).toBe(' 0');
    const estado = pf.find(l => l.slice(18, 28).trim() === 'ESTADO')!;
    expect(estado[34]).toBe('A');
    expect(estado.slice(44)).toMatch(/^VARLEN/);
    expect(pf.some(l => l[16] === 'R' && l.slice(18, 28).trim() === 'PEDIDOSR')).toBe(true);
    expect(pf.some(l => l[16] === 'K' && l.slice(18, 28).trim() === 'NUMERO')).toBe(true);
    const cl = db2Sources(shop(), GENERATED, { sql: false, dds: true }).find(
      f => f.path === 'QCLSRC/CRTDDS.clle',
    )!.text;
    expect(cl.replace(/\s+\+\s+/g, ' ').replace(/ +/g, ' ')).toContain(
      'ADDPFCST FILE(&LIB/PEDIDOS) TYPE(*REFCST) KEY(CLIENTE) PRNFILE(&LIB/CLIENTESDE) PRNKEY(ID) DLTRULE(*CASCADE) UPDRULE(*NOACTION)',
    );
  });

  it('el modelo calcula los nombres de sistema con todas las tablas, elija lo que elija', () => {
    expect(db2Model(shop(), { tableIds: ['n-pedido'] }).map(t => [t.system, t.created])).toEqual([
      ['CLIENTESDE', false],
      ['PEDIDOS', true],
    ]);
  });
});
