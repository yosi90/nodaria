import { hideNewTypesInGenealogy } from '../layoutFilters';
import type { Project, ProjectKind } from '../types';
import { carsExample } from './cars';
import { puertoNorteExample } from './puertoNorte';
import { emptyTemplate, fantasyTemplate, novelTemplate } from './worldTemplates';
import { softwareTemplate, commercialTemplate, eventTemplate } from './generalTemplates';

/*
 * Catálogo de ejemplos y plantillas. Un «ejemplo» trae datos y sirve para aprender; una «plantilla»
 * solo trae tipos. Ambos se abren como proyecto nuevo (una copia propia del usuario, editable y
 * sincronizada como cualquier otro) y los tipos de cualquiera se pueden añadir al proyecto actual.
 */

export interface TemplateInfo {
  id: string;
  kind: 'example' | 'template';
  name: string;
  summary: string;
  /** Qué enseña o qué incluye, en frases cortas. */
  highlights: string[];
  build: () => Project;
}

const CATALOG: TemplateInfo[] = [
  {
    id: 'software',
    kind: 'template',
    name: 'Desarrollo de programas',
    summary: 'Sistemas, módulos, funciones y requisitos.',
    highlights: ['Sistema → Módulo → Función', 'Dependencias y criterios de aceptación'],
    build: softwareTemplate,
  },
  {
    id: 'commercial',
    kind: 'template',
    name: 'Gestión comercial',
    summary: 'Empresas, contactos, productos y oportunidades.',
    highlights: ['Teléfono y correo compartidos', 'Fases de venta, importes y productos ofrecidos'],
    build: commercialTemplate,
  },
  {
    id: 'events',
    kind: 'template',
    name: 'Planificación de eventos',
    summary: 'Eventos, actividades, personas, lugares y recursos.',
    highlights: ['Agenda, presupuesto y aforo', 'Asistencia, responsables y recursos necesarios'],
    build: eventTemplate,
  },
  {
    id: 'cars',
    kind: 'example',
    name: 'Coches',
    summary: 'Marcas, modelos y piezas. El punto de partida del recorrido guiado.',
    highlights: [
      'Tres tipos con atributos',
      'Jerarquía marca → modelo',
      'Relaciones «Monta» y «Compite con»',
      'Un atributo calculado',
    ],
    build: carsExample,
  },
  {
    id: 'puerto-norte',
    kind: 'example',
    name: 'Caso Puerto Norte',
    summary: 'Una investigación periodística ficticia: personas, empresas, pagos, documentos y fuentes.',
    highlights: [
      'Herencia en tres niveles con tipos abstractos y preformas',
      'Familias con género, organigrama alternativo y filiales',
      'Referencias dibujadas, relaciones con importes y límites',
      'Vistas guardadas y consultas de la investigación',
    ],
    build: puertoNorteExample,
  },
  {
    id: 'fantasy',
    kind: 'template',
    name: 'Mundo de fantasía',
    summary: 'Personajes, razas, lugares, reinos, deidades, escuelas de magia, facciones, objetos y acontecimientos.',
    highlights: [
      'Familia genealógica',
      'Lealtad, enemistad, culto, pertenencia y práctica de magia',
      'Sin datos: solo los tipos',
    ],
    build: fantasyTemplate,
  },
  {
    id: 'novel',
    kind: 'template',
    name: 'Novela',
    summary: 'Libros, personajes, lugares, organizaciones, capítulos y escenas, para cualquier género.',
    highlights: ['Capítulo → Escena con punto de vista y estado', '«Aparece en» para saber quién sale dónde'],
    build: novelTemplate,
  },
  {
    id: 'empty',
    kind: 'template',
    name: 'Vacío',
    summary: 'Empieza desde cero: define tus propios tipos.',
    highlights: [],
    build: emptyTemplate,
  },
];

/** Tipo de proyecto de cada ejemplo o plantilla: adapta los ejemplos de la interfaz al abrirlo. */
const KINDS: Record<string, ProjectKind> = {
  software: 'software',
  commercial: 'marketing',
  events: 'events',
  'puerto-norte': 'research',
  fantasy: 'rpg',
  novel: 'novel',
};

export const TEMPLATES: TemplateInfo[] = CATALOG.map(t => ({
  ...t,
  build: () => ({ ...t.build(), kind: KINDS[t.id] ?? 'general' }),
}));

export const templateById = (id: string) => TEMPLATES.find(t => t.id === id);

/**
 * Añade a un proyecto los tipos, preformas y parentescos de una plantilla. Se omiten los que ya
 * existen con el mismo id (añadir dos veces no duplica); los nodos y relaciones no se copian.
 */
export function mergeTemplate(p: Project, template: Project): Project {
  const schemaIds = new Set(p.schemas.map(s => s.id));
  const libraryIds = new Set(p.fieldLibrary.map(f => f.id));
  const kinshipIds = new Set(p.kinship.map(k => k.id));
  const schemas = template.schemas.filter(s => !schemaIds.has(s.id));
  const fieldLibrary = template.fieldLibrary.filter(f => !libraryIds.has(f.id));
  const kinship = template.kinship.filter(k => !kinshipIds.has(k.id));
  if (!schemas.length && !fieldLibrary.length && !kinship.length) return p;
  const merged = {
    ...p,
    schemas: [...p.schemas, ...schemas],
    fieldLibrary: [...p.fieldLibrary, ...fieldLibrary],
    kinship: [...p.kinship, ...kinship],
  };
  return hideNewTypesInGenealogy(
    merged,
    schemas.map(s => s.id),
  );
}
