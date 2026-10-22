import type { ProjectKind } from './types';

/*
 * Tipo de proyecto. No cambia el modelo: solo adapta los ejemplos y textos de ayuda de la interfaz
 * (placeholders, guía de fórmulas, explicaciones del editor de tipos) para que hablen del tema del
 * proyecto. Se elige al crearlo desde una plantilla y se cambia en el engranaje del proyecto.
 */

export interface KindVocabulary {
  /** Ejemplos de nombres de tipo de entidad y de relación para los placeholders. */
  entity: string;
  relation: string;
  /** Listas de ejemplos para los textos de presentación. */
  entities: string;
  relations: string;
  folder: string;
  /** «un personaje venera como máximo a un dios»: límite por nodo como origen de 1. */
  limit: string;
  /** Relaciones estructurales en las que A cuelga de B y en las que B cuelga de A. */
  childOf: string;
  parentOf: string;
  /** Nombre de una relación dirigida y cómo la ve el destino. */
  inverse: [string, string];
  /** Dos tipos para explicar {tipo} en las etiquetas. */
  typeNames: [string, string];
  /** Ejemplo principal de la guía de fórmulas. */
  formula: { expr: string; result: string };
  /** Seguir una referencia: expresión y explicación. */
  reference: { expr: string; text: string };
  /** Ejemplos al final de la guía de fórmulas. */
  formulas: { expr: string; text: string }[];
  /** Placeholder de la fórmula de un atributo calculado. */
  formulaPlaceholder: string;
}

export const PROJECT_KINDS: {
  id: ProjectKind;
  label: string;
  description: string;
  /** El calendario del mundo (meses y días propios) es parte del proyecto: va arriba y destacado. */
  worldCalendar?: boolean;
}[] = [
  { id: 'general', label: 'General', description: 'Ejemplos neutros: personas, productos y actividades.' },
  { id: 'database', label: 'Base de datos', description: 'Tablas, columnas y claves foráneas.' },
  { id: 'novel', label: 'Novela o guion', description: 'Personajes, capítulos y escenas.', worldCalendar: true },
  {
    id: 'rpg',
    label: 'Rol y mundos de fantasía',
    description: 'Reinos, dioses, magia y personajes.',
    worldCalendar: true,
  },
  { id: 'marketing', label: 'Comercial y marketing', description: 'Clientes, campañas, productos y ventas.' },
  { id: 'software', label: 'Desarrollo de programas', description: 'Módulos, tareas, servicios y versiones.' },
  { id: 'events', label: 'Eventos', description: 'Sesiones, ponentes, salas y proveedores.' },
  { id: 'research', label: 'Investigación', description: 'Fuentes, actores, pruebas y hechos.' },
];

const VOCABULARY: Record<ProjectKind, KindVocabulary> = {
  general: {
    entity: 'Persona',
    relation: 'Trabaja en',
    entities: 'Persona, Producto, Actividad…',
    relations: 'Trabaja en, Depende de, Participa en…',
    folder: 'Personas',
    limit: '«una persona trabaja como máximo en una empresa»',
    childOf: '«trabaja en», «forma parte de»',
    parentOf: '«contiene», «dirige»',
    inverse: ['Dirige', 'Dirigido por'],
    typeNames: ['Producto', 'Evento'],
    formula: { expr: '{nombre} · {cargo} en {empresa}', result: 'Laura Gil · Directora en Ibex' },
    reference: { expr: '{empresa.ciudad}', text: 'Lee «ciudad» en la empresa a la que apunta la referencia.' },
    formulas: [
      { expr: '{nombre} ({edad(nacimiento)})', text: 'Nombre y edad en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Colabora con)} colaboraciones', text: 'Cuántas relaciones de un tipo tiene.' },
      { expr: 'Equipo: {lista(hijos)}', text: 'Los subnodos de un departamento.' },
      { expr: '{padre.tipo}: {padre}', text: '«Departamento: Ventas» en una persona que cuelga de él.' },
      { expr: '{empresa.ciudad} · {proyecto.estado}', text: 'Rasgos de dos nodos referidos, uno junto a otro.' },
    ],
    formulaPlaceholder: '{nombre} — {cargo}',
  },
  database: {
    entity: 'Producto',
    relation: 'Pertenece a',
    entities: 'Cliente, Pedido, Producto, Transportista…',
    relations: 'Pertenece a, Depende de, Sustituye a…',
    folder: 'Ventas',
    limit: '«un pedido tiene como máximo una factura»',
    childOf: '«pertenece a», «es detalle de»',
    parentOf: '«agrupa», «contiene»',
    inverse: ['Sustituye a', 'Sustituido por'],
    typeNames: ['Producto', 'Pedido'],
    formula: {
      expr: '{codigo} · {nombre} — envía {transportista}',
      result: 'P-0042 · Teclado — envía Envíos Norte',
    },
    reference: {
      expr: '{transportista.telefono}',
      text: 'Lee «telefono» en la fila de Transportista a la que apunta la clave foránea del producto.',
    },
    formulas: [
      { expr: '{nombre} ({tipo})', text: 'Nombre de la tabla y su tipo en la tarjeta.' },
      {
        expr: '{transportista.nombre} · {categoria.nombre}',
        text: 'Datos de dos tablas referenciadas por clave foránea.',
      },
      { expr: '{contar(relaciones)} vínculos', text: 'Cuántas relaciones tiene la tabla con otras.' },
      { expr: '{padre.tipo}: {padre}', text: '«Esquema: Ventas» en una tabla que cuelga de un esquema.' },
      { expr: '{dias(alta, baja)} días activo', text: 'Días entre dos fechas de una fila.' },
    ],
    formulaPlaceholder: '{codigo} — {nombre}',
  },
  novel: {
    entity: 'Personaje',
    relation: 'Aparece en',
    entities: 'Personaje, Lugar, Capítulo, Escena…',
    relations: 'Aparece en, Ama a, Traiciona a…',
    folder: 'Secundarios',
    limit: '«una escena ocurre como máximo en un lugar»',
    childOf: '«ocurre en», «hijo de»',
    parentOf: '«contiene», «narra»',
    inverse: ['Traiciona a', 'Traicionado por'],
    typeNames: ['Personaje', 'Capítulo'],
    formula: {
      expr: '{nombre}, {edad} años. Aparece en {lista(relaciones:Aparece en)}.',
      result: 'Marta, 34 años. Aparece en Capítulo 1, Capítulo 4.',
    },
    reference: { expr: '{lugar.ciudad}', text: 'Lee «ciudad» en el lugar donde ocurre la escena.' },
    formulas: [
      { expr: '{nombre} ({edad(nacimiento)})', text: 'Nombre y edad en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Aparece en)} escenas', text: 'En cuántas escenas sale un personaje.' },
      { expr: 'Escenas: {lista(hijos)}', text: 'Las escenas que cuelgan de un capítulo.' },
      { expr: '{padre.tipo}: {padre}', text: '«Capítulo: El regreso» en una escena que cuelga de él.' },
      { expr: '{lugar.ciudad} · {narrador.nombre}', text: 'Rasgos de dos nodos referidos, uno junto a otro.' },
    ],
    formulaPlaceholder: '{nombre} — {edad}',
  },
  rpg: {
    entity: 'Personaje',
    relation: 'Venera a',
    entities: 'Personaje, Reino, Dios, Escuela de magia…',
    relations: 'Venera a, Gobierna, Aliado de…',
    folder: 'Deidades menores',
    limit: '«un personaje venera como máximo a un dios»',
    childOf: '«vive en», «hijo de»',
    parentOf: '«contiene», «gobierna»',
    inverse: ['Venera a', 'Venerado por'],
    typeNames: ['Personaje', 'Reino'],
    formula: {
      expr: '{nombre}, {edad} años. Vive en {padre} y venera a {dios}.',
      result: 'Aria, 30 años. Vive en Vael y venera a Solenne.',
    },
    reference: { expr: '{dios.dominio}', text: 'Lee «dominio» en el dios patrón al que apunta la referencia.' },
    formulas: [
      { expr: '{nombre} ({edad(nacimiento)})', text: 'Nombre y edad en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Enemistad)} enemigos', text: 'Cuántos enemigos declarados tiene un personaje.' },
      {
        expr: 'Hijos: {lista(relaciones:Progenitor)}',
        text: 'Los descendientes directos según una relación «Progenitor».',
      },
      { expr: '{padre.tipo}: {padre}', text: '«Reino: Vael» en un lugar que cuelga de un reino.' },
      { expr: '{dios.dominio} · {escuela.disciplina}', text: 'Rasgos de dos nodos referidos, uno junto a otro.' },
    ],
    formulaPlaceholder: '{nombre} — {edad}',
  },
  marketing: {
    entity: 'Cliente',
    relation: 'Compra',
    entities: 'Cliente, Campaña, Producto, Oportunidad…',
    relations: 'Compra, Atiende a, Recomienda…',
    folder: 'Clientes clave',
    limit: '«un cliente tiene como máximo un comercial asignado»',
    childOf: '«pertenece a», «es filial de»',
    parentOf: '«agrupa», «gestiona»',
    inverse: ['Atiende a', 'Atendido por'],
    typeNames: ['Cliente', 'Campaña'],
    formula: {
      expr: '{nombre} · {sector} — {contar(relaciones:Compra)} compras',
      result: 'Ibex Retail · Moda — 12 compras',
    },
    reference: { expr: '{comercial.telefono}', text: 'Lee «telefono» en el comercial asignado al cliente.' },
    formulas: [
      { expr: '{nombre} ({sector})', text: 'Nombre y sector en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Compra)} compras', text: 'Cuántas compras tiene un cliente.' },
      { expr: 'Contactos: {lista(hijos)}', text: 'Los contactos que cuelgan de una empresa.' },
      { expr: '{padre.tipo}: {padre}', text: '«Cuenta: Ibex Retail» en un contacto que cuelga de ella.' },
      { expr: '{dias(alta)} días como cliente', text: 'Días desde una fecha hasta hoy.' },
    ],
    formulaPlaceholder: '{nombre} — {sector}',
  },
  software: {
    entity: 'Módulo',
    relation: 'Depende de',
    entities: 'Módulo, Servicio, Tarea, Versión…',
    relations: 'Depende de, Llama a, Bloquea a…',
    folder: 'Backend',
    limit: '«una tarea tiene como máximo un responsable»',
    childOf: '«forma parte de», «subtarea de»',
    parentOf: '«contiene», «publica»',
    inverse: ['Bloquea a', 'Bloqueada por'],
    typeNames: ['Servicio', 'Tarea'],
    formula: {
      expr: '{nombre} v{version} — depende de {contar(relaciones:Depende de)}',
      result: 'Pagos v2.3 — depende de 4',
    },
    reference: { expr: '{responsable.equipo}', text: 'Lee «equipo» en la persona responsable de la tarea.' },
    formulas: [
      { expr: '{nombre} ({estado})', text: 'Nombre y estado en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Depende de)} dependencias', text: 'Cuántos módulos necesita.' },
      { expr: 'Subtareas: {lista(hijos)}', text: 'Las subtareas que cuelgan de una tarea.' },
      { expr: '{padre.tipo}: {padre}', text: '«Épica: Pagos» en una tarea que cuelga de ella.' },
      { expr: '{dias(inicio, fin)} días', text: 'Duración entre dos fechas.' },
    ],
    formulaPlaceholder: '{nombre} — {estado}',
  },
  events: {
    entity: 'Sesión',
    relation: 'Presenta',
    entities: 'Sesión, Ponente, Sala, Proveedor…',
    relations: 'Presenta, Se celebra en, Patrocina…',
    folder: 'Día 1',
    limit: '«una sesión se celebra como máximo en una sala»',
    childOf: '«se celebra en», «forma parte de»',
    parentOf: '«incluye», «organiza»',
    inverse: ['Patrocina', 'Patrocinado por'],
    typeNames: ['Sesión', 'Sala'],
    formula: { expr: '{titulo} · {sala} — {hora}', result: 'Apertura · Auditorio — 9:30' },
    reference: { expr: '{sala.aforo}', text: 'Lee «aforo» en la sala donde se celebra la sesión.' },
    formulas: [
      { expr: '{titulo} ({hora})', text: 'Título y hora en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Presenta)} ponentes', text: 'Cuántos ponentes tiene una sesión.' },
      { expr: 'Sesiones: {lista(hijos)}', text: 'Las sesiones que cuelgan de una jornada.' },
      { expr: '{padre.tipo}: {padre}', text: '«Jornada: Día 1» en una sesión que cuelga de ella.' },
      { expr: '{dias(hoy, fecha)} días para el evento', text: 'Cuenta atrás hasta una fecha.' },
    ],
    formulaPlaceholder: '{titulo} — {hora}',
  },
  research: {
    entity: 'Fuente',
    relation: 'Confirma',
    entities: 'Fuente, Persona, Organización, Prueba…',
    relations: 'Confirma, Contradice, Financia a…',
    folder: 'Fuentes anónimas',
    limit: '«un documento tiene como máximo un autor»',
    childOf: '«trabaja en», «filial de»',
    parentOf: '«controla», «emplea»',
    inverse: ['Financia a', 'Financiado por'],
    typeNames: ['Fuente', 'Organización'],
    formula: {
      expr: '{nombre} · {cargo} — confirma {contar(relaciones:Confirma)} hechos',
      result: 'R. Vidal · Concejal — confirma 3 hechos',
    },
    reference: { expr: '{organizacion.sede}', text: 'Lee «sede» en la organización a la que pertenece la fuente.' },
    formulas: [
      { expr: '{nombre} ({fiabilidad})', text: 'Nombre y fiabilidad en una línea para la tarjeta.' },
      { expr: '{contar(relaciones:Contradice)} contradicciones', text: 'Cuántos hechos contradice una prueba.' },
      { expr: 'Empleados: {lista(hijos)}', text: 'Las personas que cuelgan de una organización.' },
      { expr: '{padre.tipo}: {padre}', text: '«Empresa: Puerto Norte S.A.» en alguien que cuelga de ella.' },
      { expr: '{dias(fecha)} días desde el hecho', text: 'Días desde una fecha hasta hoy.' },
    ],
    formulaPlaceholder: '{nombre} — {cargo}',
  },
};

export const vocabulary = (kind: ProjectKind | undefined): KindVocabulary =>
  VOCABULARY[kind ?? 'general'] ?? VOCABULARY.general;
export const kindLabel = (kind: ProjectKind) => PROJECT_KINDS.find(k => k.id === kind)?.label ?? 'General';

/**
 * Si en este tipo de proyecto tiene sentido un calendario propio (Novela y Rol): entonces se llama
 * «Calendario del mundo» y va arriba en la configuración; en el resto es «Calendario personalizado», abajo.
 */
export const hasWorldCalendar = (kind: ProjectKind) => PROJECT_KINDS.some(k => k.id === kind && k.worldCalendar);
