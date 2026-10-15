import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { migrateProject } from '../services/migrations';
import { PROJECT_FORMAT_VERSION } from './constants';
import {
  applySqlAnnotations,
  foreignKeyLinks,
  isTableType,
  parseSqlAnnotation,
  setFieldSql,
  sqlAnnotations,
  sqlType,
  sqlTypeText,
  tableColumns,
  tableFields,
  tableIssues,
  type SqlColumn,
} from './database';
import type { Project } from './types';

const pk: SqlColumn = {
  type: sqlType('int'),
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
};

/** Como el proyecto de inventario: una base abstracta con preformas y tablas que se referencian. */
function inventory(): Project {
  return project({
    fieldLibrary: [
      field('titulo', { isTitle: true }),
      field('id', { defaultValue: 'text(50)' }),
      field('fecha', { defaultValue: 'Datetime' }),
    ],
    schemas: [
      schema('archivo', { isAbstract: true, table: true, fields: [{ ref: 'titulo' }, { ref: 'id' }] }),
      schema('sede', { parentTypeId: 'archivo', fields: [field('direccion', { defaultValue: 'texto(50)' })] }),
      schema('almacen', {
        parentTypeId: 'archivo',
        fields: [field('id_sede', { type: 'nodeRef', defaultValue: 'n-sede' }), { ref: 'fecha' }],
      }),
      schema('nota'),
    ],
    nodes: [
      node('n-sede', 'sede', null, { titulo: 'Sede', id: 'text(50)', direccion: 'Calle Mayor' }),
      node('n-almacen', 'almacen', null, { titulo: 'Almacen', id_sede: 'n-sede', fecha: 'Datetime' }),
      node('n-nota', 'nota'),
    ],
  });
}

describe('anotaciones de tipo SQL', () => {
  it('interpreta la notación escrita a mano', () => {
    const text = (value: string) => {
      const type = parseSqlAnnotation(value);
      return type && sqlTypeText(type);
    };
    expect(text('text(50)')).toBe('nvarchar(50)');
    expect(text('texto(10)')).toBe('nvarchar(10)');
    expect(text('text')).toBe('nvarchar(max)');
    expect(text('nvarchar')).toBe('nvarchar(50)');
    expect(text('char')).toBe('char(1)');
    expect(text('numeric(10,2)')).toBe('numeric(10,2)');
    expect(text('numeric(13)')).toBe('numeric(13,0)');
    expect(text('Datetime')).toBe('datetime');
    expect(text('Si/No')).toBe('bit');
    expect(text('Fecha')).toBe('date');
    expect(text('Lista de opciones')).toBeNull();
    expect(text('Option')).toBeNull();
    expect(text('nvarchar(9000)')).toBeNull();
    expect(text('int(4)')).toBeNull();
  });
});

describe('tablas como tipos', () => {
  it('heredan la marca de tabla y las columnas, sin el título', () => {
    const p = inventory();
    expect(isTableType(p, 'almacen')).toBe(true);
    expect(isTableType(p, 'nota')).toBe(false);
    expect(tableColumns(p, 'almacen').map(c => c.field.id)).toEqual(['id', 'id_sede', 'fecha']);
    const origins = tableFields(p, 'almacen').map(c => [c.field.id, c.origin.kind]);
    expect(origins).toEqual([
      ['titulo', 'inherited'],
      ['id', 'inherited'],
      ['id_sede', 'own'],
      ['fecha', 'library'],
    ]);
  });

  it('una referencia toma el tipo de la clave primaria de la tabla destino', () => {
    let p = inventory();
    expect(sqlTypeText(tableColumns(p, 'almacen')[1].type)).toBe('int');
    p = setFieldSql(p, 'id', { ...pk, type: sqlType('uniqueidentifier') });
    expect(sqlTypeText(tableColumns(p, 'almacen')[1].type)).toBe('uniqueidentifier');
    // La preforma vive en la biblioteca: el cambio vale para todas las tablas.
    expect(p.fieldLibrary.find(f => f.id === 'id')?.sql?.primaryKey).toBe(true);
    expect(tableColumns(p, 'sede')[0].sql.primaryKey).toBe(true);
  });

  it('una clave primaria nunca admite nulos', () => {
    const p = setFieldSql(inventory(), 'direccion', { ...pk, nullable: true, identity: false });
    expect(tableColumns(p, 'sede').find(c => c.field.id === 'direccion')?.sql.nullable).toBe(false);
  });

  it('dibuja las claves foráneas entre nodos tabla hacia su clave primaria', () => {
    let p = inventory();
    expect(foreignKeyLinks(p)).toEqual([
      { sourceId: 'n-almacen', fieldId: 'id_sede', targetId: 'n-sede', targetFieldId: null },
    ]);
    p = setFieldSql(p, 'id', pk);
    expect(foreignKeyLinks(p)[0].targetFieldId).toBe('id');
    // Una referencia a un nodo que no es tabla no es clave foránea.
    p = { ...p, nodes: p.nodes.map(n => (n.id === 'n-almacen' ? { ...n, values: { id_sede: 'n-nota' } } : n)) };
    expect(foreignKeyLinks(p)).toEqual([]);
  });

  it('avisa de la falta de clave primaria y de IDENTITY en un texto', () => {
    const p = inventory();
    expect(tableIssues(p, 'sede').map(i => i.message)).toContain(
      'Sin clave primaria: marca la columna (o columnas) que identifican cada fila.',
    );
    const wrong = setFieldSql(p, 'direccion', { ...pk, primaryKey: false, type: sqlType('nvarchar', 20) });
    expect(tableIssues(wrong, 'sede').some(i => i.fieldId === 'direccion' && i.severity === 'error')).toBe(true);
  });

  it('convierte las anotaciones en tipos y quita las que se copiaron a las fichas', () => {
    const p = applySqlAnnotations(inventory(), 'almacen');
    const columns = tableColumns(p, 'almacen');
    expect(columns.map(c => sqlTypeText(c.type))).toEqual(['nvarchar(50)', 'int', 'datetime']);
    expect(p.fieldLibrary.find(f => f.id === 'fecha')?.defaultValue).toBe('');
    const almacen = p.nodes.find(n => n.id === 'n-almacen')!;
    expect(almacen.values).toEqual({ titulo: 'Almacen', id_sede: 'n-sede' });
    // Los valores reales se conservan; los de otras tablas que repetían la anotación también se limpian.
    expect(p.nodes.find(n => n.id === 'n-sede')!.values).toEqual({ titulo: 'Sede', direccion: 'Calle Mayor' });
  });

  it('sin tipo, convierte las anotaciones de todas las tablas una sola vez', () => {
    expect(sqlAnnotations(inventory()).map(a => a.field.id)).toEqual(['id', 'direccion', 'fecha']);
    const p = applySqlAnnotations(inventory());
    expect(sqlTypeText(tableColumns(p, 'sede')[1].type)).toBe('nvarchar(50)');
    expect(tableColumns(p, 'sede')[1].deduced).toBe(false);
  });
});

describe('formato 6', () => {
  it('descarta la configuración SQL por nodo de v5 y conserva los metadatos de v6', () => {
    const raw = {
      ...inventory(),
      formatVersion: 5,
      databaseDesign: { dialect: 'sqlserver', tables: [], foreignKeys: [], positions: {} },
      view: { ...inventory().view, databaseSchema: true },
    };
    const migrated = migrateProject(raw as never);
    expect(migrated.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect('databaseDesign' in migrated).toBe(false);
    expect('databaseSchema' in migrated.view).toBe(false);
    const kept = migrateProject(setFieldSql(inventory(), 'id', pk) as never);
    expect(kept.fieldLibrary.find(f => f.id === 'id')?.sql).toEqual(pk);
    expect(kept.schemas.find(s => s.id === 'archivo')?.table).toBe(true);
  });

  it('lee con cautela metadatos dañados', () => {
    const raw = inventory();
    raw.fieldLibrary[1] = { ...raw.fieldLibrary[1], sql: { type: { name: 'nada' }, primaryKey: 'sí' } as never };
    expect(migrateProject(raw as never).fieldLibrary[1].sql).toEqual({
      type: null,
      primaryKey: false,
      nullable: true,
      unique: false,
      identity: false,
      excluded: false,
    });
  });
});
