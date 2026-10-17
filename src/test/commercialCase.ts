import { sqlType, type SqlColumn } from '../domain/database';
import type { FieldDefinition, Project } from '../domain/types';
import { field, node, project, schema } from './fixtures';

/*
 * Caso comercial de los diagramas de bases de datos (ROADMAP_DIAGRAMAS_BD.md, hito 5): clientes, pedidos,
 * líneas de pedido y productos, con una clave primaria compuesta (las líneas), una autorreferencia
 * (el jefe de un empleado), un ciclo de claves foráneas (empleado ↔ departamento), columnas UNIQUE y
 * que admiten nulos, una lista de valores limitados (el estado del pedido) y una referencia múltiple
 * (los proveedores de un producto) que pide una tabla intermedia. Las líneas se borran con su pedido
 * (ON DELETE CASCADE), el cliente del pedido tiene índice y la fecha, GETDATE() por defecto. Cada nodo de un tipo tabla es una tabla.
 */

const column = (patch: Partial<SqlColumn>): SqlColumn => ({
  type: null,
  primaryKey: false,
  nullable: true,
  unique: false,
  identity: false,
  excluded: false,
  ...patch,
});
const id = (key = 'id'): FieldDefinition =>
  field(key, {
    type: 'number',
    sql: column({ type: sqlType('int'), primaryKey: true, nullable: false, identity: true }),
  });
const title = (key: string) => field(key, { isTitle: true });
const ref = (key: string, typeId: string, sql: Partial<SqlColumn> = {}) =>
  field(key, { type: 'nodeRef', referenceTypeIds: [typeId], sql: column({ nullable: false, ...sql }) });
const text = (key: string, length: number, sql: Partial<SqlColumn> = {}) =>
  field(key, { sql: column({ type: sqlType('nvarchar', length), nullable: false, ...sql }) });

export function commercialCase(): Project {
  return project({
    name: 'Tienda',
    kind: 'database',
    schemas: [
      schema('cliente', {
        table: true,
        fields: [
          title('t_cliente'),
          id('cliente_id'),
          text('cliente_nombre', 100),
          text('cliente_email', 200, { unique: true, nullable: true }),
        ],
      }),
      schema('producto', {
        table: true,
        fields: [
          title('t_producto'),
          id('producto_id'),
          text('sku', 20, { unique: true }),
          field('precio', { type: 'number', sql: column({ type: sqlType('decimal', null, 10, 2), nullable: false }) }),
          field('proveedores', { type: 'nodeRefs', referenceTypeIds: ['proveedor'] }),
        ],
      }),
      schema('proveedor', {
        table: true,
        fields: [title('t_proveedor'), id('proveedor_id'), text('proveedor_nombre', 100)],
      }),
      schema('pedido', {
        table: true,
        fields: [
          title('t_pedido'),
          id('pedido_id'),
          ref('pedido_cliente', 'cliente', { indexed: true, uniqueGroup: 'cliente_fecha' }),
          field('fecha', {
            type: 'date',
            sql: column({
              type: sqlType('date'),
              nullable: false,
              defaultValue: 'GETDATE()',
              uniqueGroup: 'cliente_fecha',
            }),
          }),
          field('estado', {
            type: 'select',
            options: ['Abierto', 'Enviado', 'Cerrado'],
            sql: column({ type: sqlType('nvarchar', 20), nullable: false }),
          }),
        ],
      }),
      schema('linea', {
        table: true,
        fields: [
          title('t_linea'),
          ref('linea_pedido', 'pedido', { primaryKey: true, onDelete: 'CASCADE' }),
          field('numero', { type: 'number', sql: column({ type: sqlType('int'), primaryKey: true, nullable: false }) }),
          ref('linea_producto', 'producto'),
          field('cantidad', { type: 'number', sql: column({ type: sqlType('int'), nullable: false }) }),
        ],
      }),
      // Una devolución apunta a una línea de pedido, cuya clave primaria es compuesta.
      schema('devolucion', {
        table: true,
        fields: [title('t_devolucion'), id('devolucion_id'), ref('devuelta', 'linea', { indexed: true })],
      }),
      schema('departamento', {
        table: true,
        fields: [title('t_departamento'), id('departamento_id'), ref('responsable', 'empleado', { nullable: true })],
      }),
      schema('empleado', {
        table: true,
        fields: [
          title('t_empleado'),
          id('empleado_id'),
          ref('empleado_departamento', 'departamento'),
          ref('jefe', 'empleado', { nullable: true }),
        ],
      }),
    ],
    nodes: [
      node('n-cliente', 'cliente', null, { t_cliente: 'Cliente' }),
      node('n-producto', 'producto', null, { t_producto: 'Producto', proveedores: ['n-proveedor'] }),
      node('n-proveedor', 'proveedor', null, { t_proveedor: 'Proveedor' }),
      node('n-pedido', 'pedido', null, { t_pedido: 'Pedido', pedido_cliente: 'n-cliente' }),
      node('n-linea', 'linea', null, {
        t_linea: 'LineaPedido',
        linea_pedido: 'n-pedido',
        linea_producto: 'n-producto',
      }),
      node('n-devolucion', 'devolucion', null, { t_devolucion: 'Devolucion', devuelta: 'n-linea' }),
      node('n-departamento', 'departamento', null, { t_departamento: 'Departamento', responsable: 'n-empleado' }),
      node('n-empleado', 'empleado', null, {
        t_empleado: 'Empleado',
        empleado_departamento: 'n-departamento',
        jefe: 'n-empleado',
      }),
    ],
  });
}
