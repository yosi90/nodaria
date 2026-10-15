import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { migrateProject } from '../services/migrations';
import { columnDefinitions, columnSqlIn, setColumnSql, sqlType, tableColumns, type SqlColumn } from './database';
import { missingRequired } from './health';
import { databaseLint, foreignKeyCycles } from './databaseLint';
import { moveSchemaInList, schemaFolderMembers, setSchemaFolder, addSchemaFolder } from './schemaFolders';
import { allFields } from './selectors';
import { sqlScript } from './sqlScript';
import type { Project } from './types';

const key: SqlColumn = {
  type: sqlType('int'),
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
};

/** Base abstracta con una preforma `id` y un atributo propio, dos tablas hijas y otra tabla que usa la preforma. */
function shop(): Project {
  return project({
    fieldLibrary: [field('id', { sql: key }), field('titulo', { isTitle: true })],
    schemas: [
      schema('base', {
        isAbstract: true,
        table: true,
        fields: [{ ref: 'titulo' }, { ref: 'id' }, field('notas', { type: 'longText' })],
      }),
      schema('cliente', { parentTypeId: 'base', fields: [field('nombre')] }),
      schema('pedido', { parentTypeId: 'base', fields: [field('cliente', { type: 'nodeRef' })] }),
      schema('suelta', { table: true, fields: [{ ref: 'titulo' }, { ref: 'id' }] }),
    ],
    nodes: [
      node('c', 'cliente', null, { titulo: 'Cliente' }),
      node('p', 'pedido', null, { titulo: 'Pedido', cliente: 'c' }),
      node('s', 'suelta', null, { titulo: 'Suelta' }),
    ],
  });
}

describe('atributos heredados por tipo', () => {
  it('un subtipo puede ocultar atributos heredados; sus propios subtipos tampoco los reciben', () => {
    let p = shop();
    p = { ...p, schemas: p.schemas.map(s => (s.id === 'cliente' ? { ...s, hiddenFieldIds: ['notas', 'nombre'] } : s)) };
    p = { ...p, schemas: [...p.schemas, schema('vip', { parentTypeId: 'cliente' })] };
    expect(allFields(p, 'cliente').map(f => f.id)).toEqual(['titulo', 'id', 'nombre']);
    expect(allFields(p, 'vip').map(f => f.id)).toEqual(['titulo', 'id', 'nombre']);
    expect(allFields(p, 'pedido').map(f => f.id)).toContain('notas');
  });

  it('el orden de un tipo mezcla heredados y propios, y lo heredan sus subtipos', () => {
    let p = shop();
    p = {
      ...p,
      schemas: p.schemas.map(s => (s.id === 'cliente' ? { ...s, fieldOrder: ['nombre', 'id', 'titulo'] } : s)),
    };
    expect(allFields(p, 'cliente').map(f => f.id)).toEqual(['nombre', 'id', 'titulo', 'notas']);
    p = { ...p, schemas: [...p.schemas, schema('vip', { parentTypeId: 'cliente', fields: [field('nivel')] })] };
    expect(allFields(p, 'vip').map(f => f.id)).toEqual(['nombre', 'id', 'titulo', 'notas', 'nivel']);
  });
});

describe('ajustes SQL por tipo', () => {
  it('cambiar una preforma heredada en un hijo no afecta al padre, a sus hermanos ni a otros tipos', () => {
    const p = setColumnSql(shop(), 'pedido', 'id', { ...key, type: sqlType('bigint') });
    const idIn = (typeId: string) => tableColumns(p, typeId).find(c => c.field.id === 'id')!;
    expect(idIn('pedido').type.name).toBe('bigint');
    expect(idIn('cliente').type.name).toBe('int');
    expect(idIn('suelta').type.name).toBe('int');
    expect(p.fieldLibrary.find(f => f.id === 'id')?.sql).toEqual(key);
    // Quitar el ajuste vuelve al heredado.
    expect(columnSqlIn(setColumnSql(p, 'pedido', 'id', null), 'pedido', p.fieldLibrary[0])).toEqual(key);
  });

  it('un hijo puede dejar fuera de la tabla una columna heredada y quitarle la clave', () => {
    const p = setColumnSql(shop(), 'cliente', 'notas', {
      ...columnSqlIn(shop(), 'cliente', field('notas')),
      excluded: true,
    });
    expect(tableColumns(p, 'cliente').map(c => c.field.id)).toEqual(['id', 'nombre']);
    expect(tableColumns(p, 'pedido').map(c => c.field.id)).toContain('notas');
    const noKey = setColumnSql(shop(), 'cliente', 'id', { ...key, primaryKey: false });
    expect(tableColumns(noKey, 'cliente')[0].sql.primaryKey).toBe(false);
    expect(tableColumns(noKey, 'pedido')[0].sql.primaryKey).toBe(true);
  });

  it('un atributo propio se cambia en su definición', () => {
    const p = setColumnSql(shop(), 'cliente', 'nombre', { ...key, identity: false, type: sqlType('nvarchar', 80) });
    expect(p.schemas.find(s => s.id === 'cliente')?.sqlOverrides).toEqual({});
    expect(tableColumns(p, 'cliente').find(c => c.field.id === 'nombre')?.type.length).toBe(80);
  });
});

describe('carpetas de tipos', () => {
  it('solo admiten tipos raíz de su clase y se pierden al heredar', () => {
    let p = addSchemaFolder(shop(), 'entity', 'Ventas', 'f1');
    p = setSchemaFolder(p, 'base', 'f1');
    p = setSchemaFolder(p, 'cliente', 'f1');
    expect(schemaFolderMembers(p, p.schemaFolders[0]).map(s => s.id)).toEqual(['base']);
    p = setSchemaFolder(p, 'suelta', 'f1');
    expect(schemaFolderMembers(p, p.schemaFolders[0]).map(s => s.id)).toEqual(['base', 'suelta']);
    // Hacer que «suelta» herede la saca de la carpeta (sigue con su nuevo padre).
    p = moveSchemaInList(p, 'suelta', 'base', 'inside');
    expect(schemaFolderMembers(p, p.schemaFolders[0]).map(s => s.id)).toEqual(['base']);
  });

  it('colocar un tipo raíz junto a otro adopta su carpeta', () => {
    let p = addSchemaFolder(shop(), 'entity', 'Ventas', 'f1');
    p = setSchemaFolder(p, 'base', 'f1');
    p = moveSchemaInList(p, 'suelta', 'base', 'after');
    expect(schemaFolderMembers(p, p.schemaFolders[0]).map(s => s.id)).toEqual(['base', 'suelta']);
  });
});

describe('script SQL Server', () => {
  it('crea las tablas, sus claves y después las claves foráneas', () => {
    const script = sqlScript(shop(), new Date('2026-10-15T00:00:00Z'));
    expect(script).toContain('CREATE TABLE [dbo].[Cliente] (');
    expect(script).toContain('    [id] int IDENTITY(1,1) NOT NULL');
    expect(script).toContain('    [notas] nvarchar(max) NULL');
    expect(script).toContain('    CONSTRAINT [PK_Cliente] PRIMARY KEY ([id])');
    expect(script).toContain(
      'ALTER TABLE [dbo].[Pedido] ADD CONSTRAINT [FK_Pedido_cliente] FOREIGN KEY ([cliente]) REFERENCES [dbo].[Cliente] ([id]);',
    );
    expect(script.indexOf('ALTER TABLE')).toBeGreaterThan(script.lastIndexOf('CREATE TABLE'));
    expect(script.trim().endsWith('COMMIT TRANSACTION;')).toBe(true);
  });

  it('escapa los nombres y numera las tablas repetidas', () => {
    const p = shop();
    p.nodes.push(node('c2', 'cliente', null, { titulo: 'cliente' }), node('x', 'suelta', null, { titulo: 'a]b' }));
    const script = sqlScript(p);
    expect(script).toContain('CREATE TABLE [dbo].[cliente_2] (');
    expect(script).toContain('CREATE TABLE [dbo].[a]]b] (');
  });

  it('comenta las claves foráneas que SQL Server rechazaría', () => {
    const p = setColumnSql(shop(), 'pedido', 'cliente', {
      ...key,
      primaryKey: false,
      identity: false,
      type: sqlType('bigint'),
    });
    expect(sqlScript(p)).toContain(
      '-- Omitida [dbo].[Pedido].[cliente] → [dbo].[Cliente]: la columna es bigint y la clave int.',
    );
  });
});

describe('revisión del esquema', () => {
  it('detecta ciclos de claves foráneas y si se pueden romper con nulos', () => {
    const p = shop();
    p.schemas = p.schemas.map(s =>
      s.id === 'cliente' ? { ...s, fields: [...s.fields, field('ultimo', { type: 'nodeRef', required: true })] } : s,
    );
    p.nodes = p.nodes.map(n => (n.id === 'c' ? { ...n, values: { ...n.values, ultimo: 'p' } } : n));
    expect(foreignKeyCycles(p)).toEqual([['c', 'p']]);
    const breakable = databaseLint(p).find(i => i.message.startsWith('Referencias cíclicas'));
    expect(breakable?.severity).toBe('warning');
    const strict = setColumnSql(p, 'pedido', 'cliente', {
      ...key,
      primaryKey: false,
      identity: false,
      type: null,
      nullable: false,
    });
    expect(databaseLint(strict).find(i => i.message.startsWith('Referencias cíclicas'))?.severity).toBe('error');
  });

  it('avisa de tablas sin clave y referencias que no llevan a una tabla', () => {
    const p = shop();
    p.schemas.push(schema('nota'));
    p.nodes.push(node('n', 'nota'));
    p.nodes = p.nodes.map(n => (n.id === 'p' ? { ...n, values: { ...n.values, cliente: 'n' } } : n));
    const messages = databaseLint(setColumnSql(p, 'suelta', 'id', { ...key, primaryKey: false })).map(i => i.message);
    expect(messages.some(m => m.startsWith('suelta: Sin clave primaria'))).toBe(true);
    expect(messages).toContain('Pedido.cliente: apunta a «nota», que no es una tabla.');
  });
});

describe('formato 7', () => {
  it('completa los campos nuevos y conserva los ajustes', () => {
    const raw = shop() as Partial<Project>;
    delete raw.kind;
    delete raw.schemaFolders;
    const migrated = migrateProject({ ...raw, formatVersion: 6 } as never);
    expect(migrated.kind).toBe('general');
    expect(migrated.schemaFolders).toEqual([]);
    const kept = migrateProject(setColumnSql({ ...shop(), kind: 'database' }, 'pedido', 'id', key) as never);
    expect(kept.kind).toBe('database');
    expect(kept.schemas.find(s => s.id === 'pedido')?.sqlOverrides.id).toEqual(key);
  });
});

describe('columnas de un nodo tabla', () => {
  it('muestran su tipo SQL en lugar de un valor y no cuentan como obligatorias sin rellenar', () => {
    const p = shop();
    p.schemas = p.schemas.map(s =>
      s.id === 'cliente'
        ? { ...s, fields: [field('nombre', { required: true }), field('alta', { type: 'date', required: true })] }
        : s,
    );
    const columns = columnDefinitions(p, 'cliente');
    expect(columns.get('id')).toBe('int IDENTITY · PK');
    expect(columns.get('nombre')).toBe('nvarchar(50) · NOT NULL');
    expect(columns.get('alta')).toBe('date · NOT NULL');
    expect(columns.has('titulo')).toBe(false);
    expect(
      missingRequired(
        p,
        p.nodes.find(n => n.id === 'c')!,
      ),
    ).toEqual([]);
    // Las referencias siguen siendo datos: una clave foránea obligatoria sin destino sí falta.
    p.schemas = p.schemas.map(s =>
      s.id === 'pedido' ? { ...s, fields: [field('cliente', { type: 'nodeRef', required: true })] } : s,
    );
    const pedido = { ...p.nodes.find(n => n.id === 'p')!, values: { titulo: 'Pedido' } };
    expect(missingRequired(p, pedido).map(f => f.id)).toEqual(['cliente']);
    // Fuera de las tablas, nada cambia.
    expect(columnDefinitions({ ...p, schemas: p.schemas.map(s => ({ ...s, table: false })) }, 'cliente').size).toBe(0);
  });
});
