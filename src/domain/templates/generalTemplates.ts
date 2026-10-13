import { buildProject, entity, field, link, relationType, type FieldSpec, type SchemaSpec } from './builder';
import { COLORS } from '../constants';
import type { Project } from '../types';

/** Bases independientes sin fichas: los ids propios permiten combinar sus tipos sin colisiones. */
function base(prefix: string) {
  let colorIndex = 0;
  const id = (name: string) => `${prefix}_${name}`;
  const library = [
    field({ id: id('nombre'), label: 'Nombre', isTitle: true, required: true }),
    field({ id: id('descripcion'), label: 'Descripción', type: 'longText' }),
    field({
      id: id('estado'),
      label: 'Estado',
      type: 'select',
      options: ['Pendiente', 'En curso', 'Completado'],
      defaultValue: 'Pendiente',
    }),
  ];
  const attribute = (name: string, spec: Omit<FieldSpec, 'id'>) => field({ id: id(name), ...spec });
  const type = (
    name: string,
    title: string,
    icon: string,
    extra: SchemaSpec['fields'] = [],
    patch: Partial<SchemaSpec> = {},
  ) =>
    entity({
      id: id(name),
      name: title,
      icon,
      color: COLORS[colorIndex++ % COLORS.length],
      fields: [link(id('nombre')), link(id('descripcion')), ...extra],
      ...patch,
    });
  const relationship = (name: string, title: string, from: string[], to: string[], patch: Partial<SchemaSpec> = {}) =>
    relationType({
      id: id(name),
      name: title,
      icon: 'link',
      color: COLORS[3],
      sourceTypeIds: from.map(id),
      targetTypeIds: to.map(id),
      ...patch,
    });
  return { id, library, attribute, type, relationship };
}

export function softwareTemplate(): Project {
  const b = base('tpl_software');
  return buildProject({
    name: 'Desarrollo de programas',
    fieldLibrary: b.library,
    schemas: [
      b.type(
        'sistema',
        'Sistema',
        'phosphor-code',
        [b.attribute('repositorio', { label: 'Repositorio', type: 'url' })],
        { allowedChildTypeIds: [b.id('modulo'), b.id('requisito')] },
      ),
      b.type('modulo', 'Módulo', 'boxes', [b.attribute('lenguaje', { label: 'Lenguaje' }), link(b.id('estado'))], {
        allowedChildTypeIds: [b.id('modulo'), b.id('funcion')],
      }),
      b.type('funcion', 'Función', 'phosphor-code', [
        b.attribute('entrada', { label: 'Entradas', type: 'longText' }),
        b.attribute('salida', { label: 'Salidas', type: 'longText' }),
        link(b.id('estado')),
      ]),
      b.type('requisito', 'Requisito', 'phosphor-task', [
        b.attribute('criterios', { label: 'Criterios de aceptación', type: 'longText' }),
        link(b.id('estado')),
      ]),
      b.relationship('depende', 'Depende de', ['modulo', 'funcion'], ['modulo', 'funcion'], {
        inverseName: 'Necesario para',
      }),
      b.relationship('implementa', 'Implementa', ['modulo', 'funcion'], ['requisito'], {
        inverseName: 'Implementado por',
      }),
    ],
  });
}

export function commercialTemplate(): Project {
  const b = base('tpl_comercial');
  b.library.push(
    b.attribute('telefono', { label: 'Teléfono', icon: 'phosphor-phone' }),
    b.attribute('correo', { label: 'Correo electrónico', icon: 'phosphor-mail' }),
  );
  return buildProject({
    name: 'Gestión comercial',
    fieldLibrary: b.library,
    schemas: [
      b.type('empresa', 'Empresa', 'building', [
        link(b.id('telefono')),
        link(b.id('correo')),
        b.attribute('web', { label: 'Web', type: 'url' }),
      ]),
      b.type('persona', 'Persona', 'user', [
        link(b.id('telefono')),
        link(b.id('correo')),
        b.attribute('cargo', { label: 'Cargo' }),
      ]),
      b.type('producto', 'Producto o servicio', 'phosphor-store', [
        b.attribute('precio', { label: 'Precio', type: 'number', nonNegative: true }),
      ]),
      b.type('oportunidad', 'Oportunidad', 'phosphor-briefcase', [
        b.attribute('importe', { label: 'Importe previsto', type: 'number', nonNegative: true }),
        b.attribute('cierre', { label: 'Fecha prevista', type: 'date' }),
        b.attribute('fase', {
          label: 'Fase',
          type: 'select',
          options: ['Contacto', 'Propuesta', 'Negociación', 'Ganada', 'Perdida'],
          defaultValue: 'Contacto',
        }),
      ]),
      b.relationship('trabaja', 'Trabaja en', ['persona'], ['empresa'], { inverseName: 'Cuenta con' }),
      b.relationship('cliente', 'Cliente de la oportunidad', ['empresa', 'persona'], ['oportunidad'], {
        inverseName: 'Oportunidad de',
      }),
      b.relationship('incluye', 'Incluye', ['oportunidad'], ['producto'], {
        inverseName: 'Ofrecido en',
        fields: [b.attribute('cantidad', { label: 'Cantidad', type: 'number', defaultValue: 1, nonNegative: true })],
      }),
    ],
  });
}

export function eventTemplate(): Project {
  const b = base('tpl_evento');
  return buildProject({
    name: 'Planificación de eventos',
    fieldLibrary: b.library,
    schemas: [
      b.type(
        'evento',
        'Evento',
        'phosphor-calendar',
        [
          b.attribute('fecha', { label: 'Fecha', type: 'date' }),
          b.attribute('presupuesto', { label: 'Presupuesto', type: 'number', nonNegative: true }),
        ],
        { allowedChildTypeIds: [b.id('actividad')] },
      ),
      b.type('actividad', 'Actividad', 'phosphor-task', [
        link(b.id('estado')),
        b.attribute('horario', { label: 'Horario' }),
        b.attribute('ubicacion', { label: 'Ubicación', type: 'nodeRef', referenceTypeIds: [b.id('lugar')] }),
      ]),
      b.type('persona', 'Persona', 'user', [b.attribute('telefono', { label: 'Teléfono', icon: 'phosphor-phone' })]),
      b.type('lugar', 'Lugar', 'map-pin', [
        b.attribute('direccion', { label: 'Dirección' }),
        b.attribute('aforo', { label: 'Aforo', type: 'number', nonNegative: true }),
      ]),
      b.type('recurso', 'Recurso', 'package', [
        b.attribute('coste', { label: 'Coste', type: 'number', nonNegative: true }),
      ]),
      b.relationship('asiste', 'Asiste a', ['persona'], ['evento', 'actividad'], { inverseName: 'Con asistencia de' }),
      b.relationship('responsable', 'Responsable de', ['persona'], ['actividad'], { inverseName: 'A cargo de' }),
      b.relationship('necesita', 'Necesita', ['actividad'], ['recurso'], { inverseName: 'Necesario para' }),
    ],
  });
}
