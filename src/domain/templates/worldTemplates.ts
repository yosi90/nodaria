import { buildProject, entity, field, link, relationType } from './builder';
import type { FieldDefinition, Project, Schema } from '../types';

/*
 * Plantillas sin datos: solo tipos, preformas y relaciones. «Mundo de fantasía» cubre el caso de
 * referencia (planificar una novela con un mundo propio); «Novela» añade capítulos y escenas con
 * apariciones. Sus tipos se pueden añadir también a un proyecto existente.
 */

function fantasyLibrary(): FieldDefinition[] {
  return [
    field({ id: 'tpl_nombre', label: 'Nombre del {tipo}', key: 'nombre', isTitle: true, required: true }),
    field({ id: 'tpl_descripcion', label: 'Descripción', type: 'longText' }),
    field({ id: 'tpl_etiquetas', label: 'Etiquetas', type: 'tags' }),
    field({ id: 'tpl_retrato', label: 'Retrato', type: 'image', portrait: true, imageShape: 'circle' }),
  ];
}

function fantasySchemas(): Schema[] {
  return [
    entity({
      id: 'tpl_personaje',
      name: 'Personaje',
      icon: 'user',
      color: '#8d7dff',
      fields: [
        link('tpl_nombre'),
        link('tpl_retrato'),
        field({ id: 'tpl_personaje_genero', label: 'Género', key: 'genero', type: 'gender' }),
        field({ id: 'tpl_personaje_raza', label: 'Raza', type: 'nodeRef', referenceTypeIds: ['tpl_raza'] }),
        field({
          id: 'tpl_personaje_rol',
          label: 'Rol',
          type: 'select',
          options: ['Protagonista', 'Antagonista', 'Secundario', 'Figurante'],
          nodeDisplay: 'text',
        }),
        field({ id: 'tpl_personaje_edad', label: 'Edad', type: 'number' }),
        field({
          id: 'tpl_personaje_motivacion',
          label: 'Motivación',
          type: 'longText',
          description: 'Qué quiere y qué le impide conseguirlo.',
        }),
        field({ id: 'tpl_personaje_vivo', label: 'Vivo', type: 'boolean', defaultValue: true }),
        link('tpl_descripcion'),
        link('tpl_etiquetas'),
      ],
    }),
    entity({
      id: 'tpl_raza',
      name: 'Raza',
      icon: 'dna',
      color: '#5bd6c4',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_raza_longevidad', label: 'Longevidad (años)', type: 'number' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_lugar',
      name: 'Lugar',
      icon: 'map-pin',
      color: '#77d28f',
      allowedChildTypeIds: ['tpl_lugar'],
      fields: [
        link('tpl_nombre'),
        field({
          id: 'tpl_lugar_clase',
          label: 'Clase',
          type: 'select',
          options: ['Continente', 'Región', 'Ciudad', 'Edificio', 'Ruina', 'Bosque', 'Montaña'],
          nodeDisplay: 'text',
        }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_reino',
      name: 'Reino',
      icon: 'crown',
      color: '#d7c45d',
      allowedChildTypeIds: ['tpl_lugar'],
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_reino_capital', label: 'Capital', type: 'nodeRef', referenceTypeIds: ['tpl_lugar'] }),
        field({
          id: 'tpl_reino_gobernante',
          label: 'Gobernante',
          type: 'nodeRef',
          referenceTypeIds: ['tpl_personaje'],
        }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_deidad',
      name: 'Deidad',
      icon: 'sparkles',
      color: '#ff7f9d',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_deidad_dominio', label: 'Dominio', description: 'Mar, guerra, cosechas…' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_escuela',
      name: 'Escuela de magia',
      icon: 'wand-sparkles',
      color: '#e37ad8',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_escuela_fuente', label: 'Fuente de poder' }),
        field({ id: 'tpl_escuela_coste', label: 'Coste', type: 'longText', description: 'Qué paga quien la usa.' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_faccion',
      name: 'Facción',
      icon: 'shield',
      color: '#67a9ff',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_faccion_lider', label: 'Líder', type: 'nodeRef', referenceTypeIds: ['tpl_personaje'] }),
        field({ id: 'tpl_faccion_objetivo', label: 'Objetivo', type: 'longText' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_objeto',
      name: 'Objeto',
      icon: 'gem',
      color: '#ff9f68',
      fields: [
        link('tpl_nombre'),
        field({
          id: 'tpl_objeto_portador',
          label: 'Portador actual',
          type: 'nodeRef',
          referenceTypeIds: ['tpl_personaje'],
        }),
        field({ id: 'tpl_objeto_poder', label: 'Poder', type: 'longText' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_acontecimiento',
      name: 'Acontecimiento',
      icon: 'calendar-days',
      color: '#d7c45d',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_acontecimiento_cuando', label: 'Cuándo', description: 'Año o fecha del mundo.' }),
        field({ id: 'tpl_acontecimiento_donde', label: 'Dónde', type: 'nodeRef', referenceTypeIds: ['tpl_lugar'] }),
        field({
          id: 'tpl_acontecimiento_implicados',
          label: 'Implicados',
          type: 'nodeRefs',
          referenceTypeIds: ['tpl_personaje', 'tpl_faccion'],
        }),
        link('tpl_descripcion'),
      ],
    }),
    relationType({
      id: 'tpl_familia',
      name: 'Familia',
      icon: 'users',
      color: '#8d7dff',
      genealogical: true,
      reciprocal: true,
      sourceTypeIds: ['tpl_personaje'],
      targetTypeIds: ['tpl_personaje'],
      description: 'Parentesco: el árbol genealógico y la disposición «Genealogía» salen de aquí.',
    }),
    relationType({
      id: 'tpl_lealtad',
      name: 'Leal a',
      inverseName: 'Cuenta con la lealtad de',
      icon: 'handshake',
      color: '#67a9ff',
      sourceTypeIds: ['tpl_personaje'],
      targetTypeIds: ['tpl_personaje', 'tpl_faccion', 'tpl_reino'],
      fields: [field({ id: 'tpl_lealtad_firmeza', label: 'Firmeza', type: 'scale' })],
    }),
    relationType({
      id: 'tpl_enemistad',
      name: 'Enemistad',
      icon: 'swords',
      color: '#ff7f9d',
      directed: false,
      relationStyle: 'strong',
      sourceTypeIds: ['tpl_personaje', 'tpl_faccion', 'tpl_reino'],
      targetTypeIds: ['tpl_personaje', 'tpl_faccion', 'tpl_reino'],
      fields: [field({ id: 'tpl_enemistad_motivo', label: 'Motivo', type: 'longText' })],
    }),
    relationType({
      id: 'tpl_culto',
      name: 'Venera a',
      inverseName: 'Venerado por',
      icon: 'sparkles',
      color: '#ff7f9d',
      sourceTypeIds: ['tpl_personaje', 'tpl_faccion', 'tpl_reino'],
      targetTypeIds: ['tpl_deidad'],
    }),
    relationType({
      id: 'tpl_pertenencia',
      name: 'Pertenece a',
      inverseName: 'Tiene como miembro a',
      icon: 'shield',
      color: '#67a9ff',
      sourceTypeIds: ['tpl_personaje'],
      targetTypeIds: ['tpl_faccion', 'tpl_reino'],
      fields: [field({ id: 'tpl_pertenencia_cargo', label: 'Cargo' })],
    }),
    relationType({
      id: 'tpl_practica',
      name: 'Practica',
      inverseName: 'Practicada por',
      icon: 'wand-sparkles',
      color: '#e37ad8',
      sourceTypeIds: ['tpl_personaje'],
      targetTypeIds: ['tpl_escuela'],
      fields: [
        field({ id: 'tpl_practica_nivel', label: 'Nivel', type: 'select', options: ['Aprendiz', 'Adepto', 'Maestro'] }),
      ],
    }),
  ];
}

function novelSchemas(): Schema[] {
  return [
    entity({
      id: 'tpl_capitulo',
      name: 'Capítulo',
      icon: 'book-open',
      color: '#d7c45d',
      allowedChildTypeIds: ['tpl_escena'],
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_capitulo_numero', label: 'Número', type: 'number' }),
        field({
          id: 'tpl_capitulo_pov',
          label: 'Punto de vista',
          type: 'nodeRef',
          referenceTypeIds: ['tpl_personaje'],
        }),
        field({
          id: 'tpl_capitulo_estado',
          label: 'Estado',
          type: 'select',
          options: ['Idea', 'Esbozo', 'Borrador', 'Revisado'],
          defaultValue: 'Idea',
          nodeDisplay: 'text',
        }),
        field({ id: 'tpl_capitulo_escenas', label: 'Escenas', type: 'computed', formula: '{contar(hijos)}' }),
        link('tpl_descripcion'),
      ],
    }),
    entity({
      id: 'tpl_escena',
      name: 'Escena',
      icon: 'drama',
      color: '#ff9f68',
      fields: [
        link('tpl_nombre'),
        field({ id: 'tpl_escena_lugar', label: 'Lugar', type: 'nodeRef', referenceTypeIds: ['tpl_lugar'] }),
        field({
          id: 'tpl_escena_objetivo',
          label: 'Objetivo dramático',
          type: 'longText',
          description: 'Qué cambia al final de la escena.',
        }),
        field({
          id: 'tpl_escena_apariciones',
          label: 'Aparecen',
          type: 'computed',
          formula: '{lista(relaciones:Aparece en)}',
        }),
        link('tpl_descripcion'),
      ],
    }),
    relationType({
      id: 'tpl_aparece',
      name: 'Aparece en',
      inverseName: 'Con la aparición de',
      icon: 'drama',
      color: '#ff9f68',
      sourceTypeIds: ['tpl_personaje'],
      targetTypeIds: ['tpl_escena', 'tpl_capitulo'],
      fields: [
        field({
          id: 'tpl_aparece_papel',
          label: 'Papel en la escena',
          type: 'select',
          options: ['Protagonista', 'Presente', 'Mencionado'],
        }),
      ],
    }),
  ];
}

export function fantasyTemplate(): Project {
  return buildProject({ name: 'Mundo de fantasía', fieldLibrary: fantasyLibrary(), schemas: fantasySchemas() });
}

export function novelTemplate(): Project {
  return buildProject({
    name: 'Novela',
    fieldLibrary: fantasyLibrary(),
    schemas: [...fantasySchemas(), ...novelSchemas()],
  });
}

export function emptyTemplate(): Project {
  return buildProject({ name: 'Proyecto vacío', schemas: [] });
}
