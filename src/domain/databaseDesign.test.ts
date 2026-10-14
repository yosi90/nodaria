import { describe, expect, it } from 'vitest';
import { project, node, schema } from '../test/fixtures';
import { deleteNode, duplicateNode } from './operations';
import { referenceLinks } from './references';
import { nodeConnections } from './connections';
import { analysisLinks } from './centrality';
import {
  applyDatabaseEdit,
  compatibleSqlTypes,
  defaultSqlType,
  editDatabaseDesign,
  emptyDatabaseDesign,
  readDatabaseDesign,
  validateDatabaseDesign,
  type DatabaseColumn,
  type DatabaseDesign,
  type DatabaseForeignKey,
  type DatabaseTable,
} from './databaseDesign';

const column = (id: string, patch: Partial<DatabaseColumn> = {}): DatabaseColumn => ({
  id,
  name: id,
  type: defaultSqlType('int'),
  nullable: false,
  identity: false,
  ...patch,
});
const table = (id: string, patch: Partial<DatabaseTable> = {}): DatabaseTable => ({
  id,
  schema: 'dbo',
  name: id,
  columns: [column('id')],
  primaryKey: ['id'],
  uniqueKeys: [],
  ...patch,
});
const fk = (patch: Partial<DatabaseForeignKey> = {}): DatabaseForeignKey => ({
  id: 'fk',
  name: 'FK_child_parent',
  sourceTableId: 'child',
  sourceColumnIds: ['parentId'],
  targetTableId: 'parent',
  targetColumnIds: ['id'],
  ...patch,
});
const design = (): DatabaseDesign => ({
  ...emptyDatabaseDesign(),
  tables: [table('parent'), table('child', { columns: [column('id'), column('parentId', { nullable: true })] })],
  foreignKeys: [fk()],
});
const errors = (d: DatabaseDesign) => validateDatabaseDesign(d).filter(i => i.severity === 'error');

describe('relational design validation', () => {
  it('models nullable foreign keys and creates a normal node for each table', () => {
    const d = design();
    expect(errors(d)).toEqual([]);
    const p = applyDatabaseEdit(project(), { kind: 'save-table', table: d.tables[0] });
    expect(p.nodes.map(n => n.id)).toEqual(['parent']);
    expect(p.schemas[0].kind).toBe('entity');
    expect(p.databaseDesign?.tables[0]).toEqual(d.tables[0]);
  });
  it('rejects a FK to a column without a complete candidate key', () => {
    const d = design();
    d.tables[0].primaryKey = [];
    expect(errors(d)[0].message).toContain('PK o UNIQUE completa');
    d.tables[0].uniqueKeys = [{ id: 'u', name: 'UQ_parent_id', columnIds: ['id'] }];
    expect(errors(d)).toEqual([]);
  });
  it('validates ordered composite mappings, including numeric synonyms', () => {
    const d = design();
    d.tables[0].columns.push(column('region'));
    d.tables[0].primaryKey.push('region');
    d.tables[1].columns.push(column('regionId'));
    d.foreignKeys[0].sourceColumnIds.push('regionId');
    d.foreignKeys[0].targetColumnIds.push('region');
    expect(errors(d)).toEqual([]);
    d.foreignKeys[0].targetColumnIds.reverse();
    expect(errors(d)[0].message).toContain('orden declarado');
    d.foreignKeys[0].targetColumnIds = ['id'];
    expect(errors(d)[0].message).toContain('mismo número');
    const a = defaultSqlType('decimal');
    const b = defaultSqlType('numeric');
    expect(compatibleSqlTypes(a, b)).toBe(true);
    expect(compatibleSqlTypes(a, { ...b, scale: 3 })).toBe(false);
  });
  it('permits different string lengths but rejects different type families', () => {
    expect(compatibleSqlTypes(defaultSqlType('varchar'), { ...defaultSqlType('varchar'), length: 100 })).toBe(true);
    const d = design();
    d.tables[1].columns[1].type = defaultSqlType('nvarchar');
    expect(errors(d)[0].message).toContain('incompatibles');
  });
  it('permits cycles and self references without a tree', () => {
    const d = design();
    d.tables[0].columns.push(column('childId'));
    d.foreignKeys.push(
      fk({
        id: 'back',
        name: 'FK_parent_child',
        sourceTableId: 'parent',
        targetTableId: 'child',
        sourceColumnIds: ['childId'],
      }),
    );
    d.foreignKeys.push(fk({ id: 'self', name: 'FK_child_self', targetTableId: 'child' }));
    expect(errors(d)).toEqual([]);
  });
  it('rejects absent, repeated columns and missing target tables', () => {
    const d = design();
    d.foreignKeys[0].sourceColumnIds = ['missing'];
    expect(errors(d)[0].message).toContain('no existe');
    d.foreignKeys[0].sourceColumnIds = ['id', 'id'];
    d.foreignKeys[0].targetColumnIds = ['id', 'id'];
    expect(errors(d)[0].message).toContain('sin repetir');
    d.foreignKeys[0].targetTableId = 'missing';
    expect(errors(d)[0].message).toContain('no existe');
  });
  it('validates PK nullability, names, SQL lengths and decimal precision', () => {
    const d = design();
    d.tables[0].columns[0].nullable = true;
    expect(errors(d)[0].message).toContain('NOT NULL');
    d.tables[0].columns[0].nullable = false;
    d.tables[0].columns[0].type = { ...defaultSqlType('nvarchar'), length: 4001 };
    expect(errors(d)[0].message).toContain('Longitud');
    d.tables[0].columns[0].type = { ...defaultSqlType('decimal'), precision: 3, scale: 4 };
    expect(errors(d)[0].message).toContain('precisión');
    d.tables[0].columns[0].type = defaultSqlType('int');
    d.tables.push(table('third', { name: 'PARENT' }));
    expect(errors(d)[0].message).toContain('repetido');
  });
  it('does not equate IDENTITY with a primary key or allow two identity columns', () => {
    const d = design();
    d.tables[1].columns.forEach(c => {
      c.identity = true;
      c.nullable = false;
    });
    expect(errors(d)[0].message).toContain('solo se admite una');
    const draft = { ...emptyDatabaseDesign(), tables: [table('draft', { primaryKey: [] })] };
    expect(errors(draft)).toEqual([]);
    expect(validateDatabaseDesign(draft).some(i => i.severity === 'warning')).toBe(true);
  });
  it('checks UNIQUE and FK names within their SQL schema', () => {
    const d = design();
    d.tables[0].uniqueKeys.push({ id: 'u', name: 'FK_child_parent', columnIds: ['id'] });
    expect(errors(d)[0].message).toContain('repetido');
  });
});

describe('atomic relational operations and loading', () => {
  it('marks an existing node without changing its type, notes, hierarchy or values', () => {
    const n = { ...node('parent', 'normal', null, { title: 'Mi tabla', ref: 'other' }), notes: 'Contexto' };
    const p = project({ schemas: [schema('normal')], nodes: [n, node('other', 'normal')] });
    const next = applyDatabaseEdit(p, { kind: 'save-table', table: table('parent') });
    expect(next.nodes).toBe(p.nodes);
    expect(next.schemas).toBe(p.schemas);
    expect(next.databaseDesign?.tables[0].id).toBe('parent');
    const unmarked = applyDatabaseEdit(next, { kind: 'delete-table', id: 'parent' });
    expect(unmarked.nodes).toBe(p.nodes);
    expect(unmarked.databaseDesign?.tables).toEqual([]);
  });
  it('mixes SQL and ordinary references in the same graph and node connections', () => {
    const p = project({
      schemas: [schema('normal')],
      nodes: [node('parent', 'normal'), node('child', 'normal'), node('document', 'normal')],
      databaseDesign: design(),
    });
    expect(referenceLinks(p)).toContainEqual({ fieldId: 'sql-fk:fk', sourceId: 'child', targetId: 'parent' });
    expect(nodeConnections(p, 'parent')?.referencesIn[0].other.id).toBe('child');
    expect(analysisLinks(p)).toEqual([{ a: 'child', b: 'parent' }]);
    const removed = deleteNode(p, 'parent');
    expect(removed.databaseDesign?.tables.map(t => t.id)).toEqual(['child']);
    expect(removed.databaseDesign?.foreignKeys).toEqual([]);
  });
  it('duplicates a table through normal node operations with new SQL names and optional connections', () => {
    const p = project({
      schemas: [schema('normal')],
      nodes: [node('parent', 'normal'), node('child', 'normal')],
      databaseDesign: design(),
    });
    p.databaseDesign!.tables[1].uniqueKeys = [{ id: 'u', name: 'UQ_child_id', columnIds: ['id'] }];
    const copy = duplicateNode(p, 'child', true, 'copy').project;
    expect(copy.nodes).toHaveLength(3);
    expect(copy.databaseDesign?.tables.find(t => t.id === 'copy')?.primaryKey).toEqual(['id']);
    expect(copy.databaseDesign?.foreignKeys).toHaveLength(2);
    expect(errors(copy.databaseDesign!)).toEqual([]);
    expect(duplicateNode(p, 'child', false, 'copy').project.databaseDesign?.foreignKeys).toHaveLength(1);
  });
  it('removes dependent constraints as a whole when deleting a column', () => {
    const d = design();
    d.tables[1].primaryKey = ['id', 'parentId'];
    d.tables[1].uniqueKeys = [{ id: 'u', name: 'UQ_child', columnIds: ['id', 'parentId'] }];
    const next = editDatabaseDesign(d, {
      kind: 'save-table',
      table: { ...d.tables[1], columns: [d.tables[1].columns[0]] },
    });
    expect(next.tables[1].primaryKey).toEqual([]);
    expect(next.tables[1].uniqueKeys).toEqual([]);
    expect(next.foreignKeys).toEqual([]);
    expect(d.foreignKeys).toHaveLength(1);
  });
  it('removes inbound/outbound FKs and positions with a table', () => {
    const d = design();
    d.positions.parent = { x: 1.1, y: -2 };
    const next = editDatabaseDesign(d, { kind: 'delete-table', id: 'parent' });
    expect(next.tables.map(t => t.id)).toEqual(['child']);
    expect(next.foreignKeys).toEqual([]);
    expect(next.positions).toEqual({});
  });
  it('rejects an invalid edit and preserves exact fractional manual positions', () => {
    const p = project({ databaseDesign: design() });
    expect(applyDatabaseEdit(p, { kind: 'save-fk', foreignKey: fk({ targetTableId: 'unknown' }) })).toBe(p);
    const moved = applyDatabaseEdit(p, { kind: 'positions', positions: { parent: { x: 1.234, y: -2.456 } } });
    expect(moved.databaseDesign?.positions.parent).toEqual({ x: 1.234, y: -2.456 });
    expect(applyDatabaseEdit(p, { kind: 'positions', positions: { missing: { x: 0, y: 0 } } })).toBe(p);
  });
  it('retains valid structure and rejects corrupted data instead of silently dropping it', () => {
    expect(readDatabaseDesign(JSON.parse(JSON.stringify(design())))).toEqual(design());
    expect(readDatabaseDesign(undefined)).toBeUndefined();
    expect(() => readDatabaseDesign({ ...design(), tables: 'bad' })).toThrow();
    expect(() => readDatabaseDesign({ ...design(), positions: { parent: { x: null, y: 0 } } })).toThrow();
    const d = design();
    d.foreignKeys[0].targetColumnIds = ['missing'];
    expect(readDatabaseDesign(d)).toEqual(d);
    expect(errors(readDatabaseDesign(d)!)).not.toEqual([]);
  });
});
