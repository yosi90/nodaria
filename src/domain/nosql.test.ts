import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { tableCardColumns } from '../components/map/tableCard';
import { migrateProject } from '../services/migrations';
import {
  databaseLinks,
  engineOf,
  isDatabaseType,
  isEmbeddedType,
  isTableType,
  projectEngines,
  tableColumns,
  tableTypes,
} from './database';
import { documentLint } from './documentLint';
import { firestoreRules } from './firestoreRules';
import { mongoScript } from './mongoScript';
import { neo4jSchema, projectCypher } from './neo4j';
import { sqlScript } from './sqlScript';
import type { Project } from './types';

const pk = {
  type: { name: 'int' as const, length: null, precision: null, scale: null },
  primaryKey: true,
  nullable: false,
  unique: false,
  identity: true,
  excluded: false,
};

/** Una tienda que mezcla motores: clientes en SQL Server, pedidos en MongoDB y reseñas en Firestore. */
function shop(): Project {
  return project({
    schemas: [
      schema('base', {
        isAbstract: true,
        table: true,
        dbEngine: 'mongodb',
        fields: [field('titulo', { isTitle: true })],
      }),
      schema('cliente', { table: true, fields: [field('nombre', { isTitle: true }), field('id', { sql: pk })] }),
      schema('direccion', {
        parentTypeId: 'base',
        embedded: true,
        fields: [
          field('calle'),
          field('cp', { sql: { ...pk, primaryKey: false, identity: false, nullable: true, indexed: true } }),
        ],
      }),
      schema('linea', {
        parentTypeId: 'base',
        embedded: true,
        fields: [field('producto'), field('cantidad', { type: 'number', required: true })],
      }),
      schema('pedido', {
        parentTypeId: 'base',
        fields: [
          field('estado', { type: 'select', options: ['nuevo', 'enviado'], required: true }),
          field('envio', { type: 'nodeRef', referenceTypeIds: ['direccion'] }),
          field('lineas', { type: 'nodeRefs', referenceTypeIds: ['linea'] }),
          field('cliente', { type: 'nodeRef', referenceTypeIds: ['cliente'] }),
          field('email', {
            sql: { ...pk, type: null, primaryKey: false, identity: false, nullable: true, unique: true },
          }),
        ],
      }),
      schema('resena', {
        table: true,
        dbEngine: 'firestore',
        fields: [
          field('titulo', { isTitle: true }),
          field('nota', { type: 'scale', required: true }),
          field('pedido', { type: 'nodeRef', referenceTypeIds: ['pedido'] }),
        ],
      }),
      schema('persona', {
        table: true,
        dbEngine: 'neo4j',
        fields: [
          field('titulo', { isTitle: true }),
          field('dni', { sql: { ...pk, type: null, primaryKey: false, identity: false, unique: true } }),
          field('amigo', { type: 'nodeRef', referenceTypeIds: ['persona'] }),
        ],
      }),
    ],
    nodes: [
      node('n-cliente', 'cliente', null, { nombre: 'clientes' }),
      node('n-pedido', 'pedido', null, { titulo: 'pedidos', cliente: 'n-cliente' }),
      node('n-resena', 'resena', 'n-pedido', { titulo: 'resenas', pedido: 'n-pedido' }),
      node('n-persona', 'persona', null, { titulo: 'Persona', amigo: 'n-persona' }),
    ],
  });
}

describe('motor por tipo', () => {
  it('se hereda, SQL Server por defecto, y solo SQL Server es tabla', () => {
    const p = shop();
    expect(engineOf(p, 'cliente')).toBe('sqlserver');
    expect(engineOf(p, 'pedido')).toBe('mongodb');
    expect(engineOf(p, 'resena')).toBe('firestore');
    expect(isTableType(p, 'pedido')).toBe(false);
    expect(isDatabaseType(p, 'pedido')).toBe(true);
    expect(isEmbeddedType(p, 'direccion')).toBe(true);
    expect(tableTypes(p).map(s => s.id)).toEqual(['cliente']);
    expect([...projectEngines(p)].sort()).toEqual(['firestore', 'mongodb', 'neo4j', 'sqlserver']);
  });

  it('un proyecto de antes sigue con sus tablas de SQL Server', () => {
    const old = { ...project({ schemas: [schema('t', { table: true })] }), formatVersion: 8 } as Record<
      string,
      unknown
    >;
    (old.schemas as Record<string, unknown>[]).forEach(s => {
      delete s.dbEngine;
      delete s.embedded;
    });
    const migrated = migrateProject(old);
    expect(migrated.schemas[0]).toMatchObject({ dbEngine: null, embedded: false });
    expect(isTableType(migrated, 't')).toBe(true);
  });
});

describe('campos de documentos', () => {
  it('deduce el tipo de cada motor e incrusta o referencia según el destino', () => {
    const p = shop();
    const byKey = Object.fromEntries(tableColumns(p, 'pedido').map(c => [c.field.key, c]));
    expect(byKey.estado.docType).toBe('string');
    expect(byKey.envio).toMatchObject({ refKind: 'embedded', docType: 'object', typeText: 'direccion' });
    expect(byKey.lineas).toMatchObject({ refKind: 'embedded', docType: 'array', typeText: '[linea]' });
    // A otra base (SQL Server) se guarda el id como texto.
    expect(byKey.cliente).toMatchObject({ refKind: 'reference', crossEngine: true, docType: 'string' });
    // Una referencia múltiple sí es un campo del documento (en SQL necesitaría una tabla intermedia).
    expect(byKey.lineas.sql.excluded).toBe(false);
  });

  it('la tarjeta de MongoDB lleva _id y despliega los subdocumentos sangrados', () => {
    const p = shop();
    const rows = tableCardColumns(p, p.nodes[1]);
    expect(rows[0]).toMatchObject({ id: '_id', type: 'objectId', primaryKey: true });
    expect(rows.map(r => [r.name, r.depth])).toEqual([
      ['_id', 0],
      ['estado', 0],
      ['envio', 0],
      ['calle', 1],
      ['cp', 1],
      ['lineas', 0],
      ['producto', 1],
      ['cantidad', 1],
      ['cliente', 0],
      ['email', 0],
    ]);
  });

  it('las líneas unen motores distintos y marcan las que cruzan de base', () => {
    const links = databaseLinks(shop());
    expect(links.map(l => [l.sourceId, l.targetId, l.crossEngine])).toEqual([
      ['n-pedido', 'n-cliente', true],
      ['n-resena', 'n-pedido', true],
      ['n-persona', 'n-persona', false],
    ]);
  });
});

describe('exportaciones', () => {
  it('MongoDB: $jsonSchema con subdocumentos, obligatorios, enum e índices por ruta', () => {
    const script = mongoScript(shop());
    const json = /crearColeccion\("pedidos", ([\s\S]*?)\);\n/.exec(script)![1];
    const schemaOf = JSON.parse(json);
    expect(schemaOf.required).toEqual(['_id', 'estado']);
    expect(schemaOf.properties.estado).toEqual({ bsonType: 'string', enum: ['nuevo', 'enviado'] });
    expect(schemaOf.properties.envio.properties.cp.bsonType).toBe('string');
    expect(schemaOf.properties.lineas).toMatchObject({
      bsonType: 'array',
      items: { bsonType: 'object', required: ['cantidad'] },
    });
    expect(schemaOf.properties.cliente.bsonType).toBe('string');
    expect(script).toContain('db.getCollection("pedidos").createIndex({ "envio.cp": 1 });');
    expect(script).toContain('db.getCollection("pedidos").createIndex({ "email": 1 }, { unique: true });');
    // Los subdocumentos no son colecciones.
    expect(script).not.toContain('crearColeccion("direccion"');
  });

  it('Firestore: subcolección bajo su colección y validación de campos', () => {
    const p = shop();
    p.nodes.push(node('n-f', 'resena', null, { titulo: 'opiniones' }));
    const rules = firestoreRules(p);
    expect(rules.startsWith("rules_version = '2';")).toBe(true);
    expect(rules).toContain("data.keys().hasOnly(['nota', 'pedido'])");
    expect(rules).toContain("data.keys().hasAll(['nota'])");
    expect(rules).toContain("data['nota'] is int");
    expect(rules).toContain("(!('pedido' in data) || data['pedido'] is string)");
    expect(rules).toContain('match /opiniones/{opinionesId} {');
    // La de «resenas» cuelga de un nodo de MongoDB: no es subcolección de nada de Firestore.
    expect(rules).toContain('    match /resenas/{resenasId} {');
  });

  it('Neo4j: restricciones del esquema y el grafo entero del proyecto', () => {
    const p = shop();
    const schemaScript = neo4jSchema(p);
    expect(schemaScript).toContain(
      'CREATE CONSTRAINT persona_dni_unico IF NOT EXISTS FOR (n:`Persona`) REQUIRE n.`dni` IS UNIQUE;',
    );
    expect(schemaScript).toContain('// (:Persona)-[:AMIGO]->(:Persona)');
    const graph = projectCypher(p);
    expect(graph).toContain("MERGE (n:Nodaria {nodaria_id: 'n-pedido'}) SET n:`base`:`pedido`");
    expect(graph).toContain(
      "MATCH (a:Nodaria {nodaria_id: 'n-resena'}), (b:Nodaria {nodaria_id: 'n-pedido'}) MERGE (a)-[:DENTRO_DE]->(b);",
    );
    expect(graph).toContain('MERGE (a)-[:CLIENTE]->(b);');
  });

  it('el script de SQL Server sigue solo con las tablas de SQL Server', () => {
    const sql = sqlScript(shop());
    expect(sql).toContain('CREATE TABLE [dbo].[clientes]');
    expect(sql).not.toContain('pedidos');
  });
});

describe('revisión de documentos', () => {
  it('avisa de listas incrustadas, referencias entre bases y nombres repetidos', () => {
    const p = shop();
    p.nodes.push(node('n-pedido-2', 'pedido', null, { titulo: 'Pedidos' }));
    const messages = documentLint(p).map(i => i.message);
    expect(messages.some(m => m.includes('lista de «linea» incrustada') && m.includes('16 MB'))).toBe(true);
    expect(messages.some(m => m.includes('pedido.cliente') && m.includes('SQL Server'))).toBe(true);
    expect(messages.some(m => m.includes('colecciones de MongoDB se llaman'))).toBe(true);
  });

  it('un subdocumento que se incrusta a sí mismo es un error', () => {
    const p = shop();
    p.schemas = p.schemas.map(s =>
      s.id === 'direccion'
        ? { ...s, fields: [...s.fields, field('otra', { type: 'nodeRef', referenceTypeIds: ['direccion'] })] }
        : s,
    );
    expect(documentLint(p).some(i => i.severity === 'error' && i.message.includes('no tendría fin'))).toBe(true);
  });
});
