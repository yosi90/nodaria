import { buildProject, entity, field, relationType } from './builder';
import type { Project } from '../types';

/*
 * Ejemplo básico: marcas, modelos y piezas de coche. Enseña lo esencial: tres tipos con atributos,
 * una jerarquía (una marca contiene sus modelos), una relación dirigida (un modelo monta piezas),
 * una simétrica (dos modelos compiten) y un atributo calculado.
 */

export function carsExample(): Project {
  return buildProject({
    name: 'Ejemplo: Coches',
    schemas: [
      entity({
        id: 'marca',
        name: 'Marca',
        icon: 'flag',
        color: '#67a9ff',
        description: 'Un fabricante. Sus modelos cuelgan de ella en la estructura.',
        fields: [
          field({ id: 'marca_nombre', label: 'Nombre', isTitle: true, required: true }),
          field({
            id: 'marca_pais',
            label: 'País',
            type: 'select',
            options: ['Alemania', 'Italia', 'Japón', 'Francia', 'Estados Unidos'],
            nodeDisplay: 'text',
          }),
          field({ id: 'marca_fundacion', label: 'Año de fundación', type: 'number' }),
          field({ id: 'marca_web', label: 'Web', type: 'url' }),
        ],
        allowedChildTypeIds: ['modelo'],
      }),
      entity({
        id: 'modelo',
        name: 'Modelo',
        icon: 'car',
        color: '#8d7dff',
        description: 'Un coche concreto. Vive dentro de su marca y monta piezas.',
        fields: [
          field({ id: 'modelo_nombre', label: 'Nombre', isTitle: true, required: true }),
          field({ id: 'modelo_anio', label: 'Año', type: 'number' }),
          field({
            id: 'modelo_segmento',
            label: 'Segmento',
            type: 'select',
            options: ['Urbano', 'Compacto', 'Berlina', 'SUV', 'Deportivo'],
            nodeDisplay: 'text',
          }),
          field({ id: 'modelo_precio', label: 'Precio base (€)', type: 'number' }),
          field({ id: 'modelo_valoracion', label: 'Valoración', type: 'scale', defaultValue: 3 }),
          field({
            id: 'modelo_piezas',
            label: 'Piezas montadas',
            type: 'computed',
            formula: '{contar(relaciones:Monta)}',
            description: 'Se calcula con las relaciones «Monta» del modelo.',
          }),
        ],
      }),
      entity({
        id: 'pieza',
        name: 'Pieza',
        icon: 'wrench',
        color: '#ff9f68',
        description: 'Un componente que pueden compartir varios modelos.',
        fields: [
          field({ id: 'pieza_nombre', label: 'Nombre', isTitle: true, required: true }),
          field({
            id: 'pieza_categoria',
            label: 'Categoría',
            type: 'select',
            options: ['Motor', 'Transmisión', 'Frenos', 'Electrónica', 'Carrocería'],
            nodeDisplay: 'text',
          }),
          field({ id: 'pieza_proveedor', label: 'Proveedor' }),
          field({ id: 'pieza_etiquetas', label: 'Etiquetas', type: 'tags' }),
        ],
      }),
      relationType({
        id: 'monta',
        name: 'Monta',
        inverseName: 'Montada en',
        icon: 'wrench',
        color: '#ff9f68',
        description: 'Un modelo monta una pieza.',
        sourceTypeIds: ['modelo'],
        targetTypeIds: ['pieza'],
        fields: [field({ id: 'monta_desde', label: 'Desde el año', type: 'number' })],
      }),
      relationType({
        id: 'compite',
        name: 'Compite con',
        icon: 'swords',
        color: '#e37ad8',
        directed: false,
        description: 'Dos modelos del mismo segmento que se disputan el mismo cliente.',
        sourceTypeIds: ['modelo'],
        targetTypeIds: ['modelo'],
        relationStyle: 'strong',
      }),
    ],
    nodes: [
      {
        id: 'ibex',
        type: 'marca',
        values: { marca_nombre: 'Ibex Motors', marca_pais: 'Alemania', marca_fundacion: 1952 },
        notes: 'Marca generalista. Su buque insignia es el [[Ibex Corsa]].',
      },
      {
        id: 'aurora',
        type: 'marca',
        values: { marca_nombre: 'Aurora Automóviles', marca_pais: 'Italia', marca_fundacion: 1967 },
      },
      {
        id: 'kestrel',
        type: 'marca',
        values: { marca_nombre: 'Kestrel Cars', marca_pais: 'Japón', marca_fundacion: 1978 },
      },

      {
        id: 'corsa',
        type: 'modelo',
        parent: 'ibex',
        values: {
          modelo_nombre: 'Ibex Corsa',
          modelo_anio: 2023,
          modelo_segmento: 'Compacto',
          modelo_precio: 24900,
          modelo_valoracion: 4,
        },
      },
      {
        id: 'cumbre',
        type: 'modelo',
        parent: 'ibex',
        values: {
          modelo_nombre: 'Ibex Cumbre',
          modelo_anio: 2022,
          modelo_segmento: 'SUV',
          modelo_precio: 38500,
          modelo_valoracion: 4,
        },
      },
      {
        id: 'luna',
        type: 'modelo',
        parent: 'aurora',
        values: {
          modelo_nombre: 'Aurora Luna',
          modelo_anio: 2024,
          modelo_segmento: 'Compacto',
          modelo_precio: 26300,
          modelo_valoracion: 3,
        },
      },
      {
        id: 'stella',
        type: 'modelo',
        parent: 'aurora',
        values: {
          modelo_nombre: 'Aurora Stella GT',
          modelo_anio: 2021,
          modelo_segmento: 'Deportivo',
          modelo_precio: 71000,
          modelo_valoracion: 5,
        },
      },
      {
        id: 'kite',
        type: 'modelo',
        parent: 'kestrel',
        values: {
          modelo_nombre: 'Kestrel Kite',
          modelo_anio: 2023,
          modelo_segmento: 'Urbano',
          modelo_precio: 17900,
          modelo_valoracion: 3,
        },
      },
      {
        id: 'ridge',
        type: 'modelo',
        parent: 'kestrel',
        values: {
          modelo_nombre: 'Kestrel Ridge',
          modelo_anio: 2024,
          modelo_segmento: 'SUV',
          modelo_precio: 41200,
          modelo_valoracion: 4,
        },
      },

      {
        id: 'motor_t14',
        type: 'pieza',
        values: {
          pieza_nombre: 'Motor 1.4 turbo',
          pieza_categoria: 'Motor',
          pieza_proveedor: 'Ibex',
          pieza_etiquetas: ['gasolina'],
        },
      },
      {
        id: 'motor_h20',
        type: 'pieza',
        values: {
          pieza_nombre: 'Motor híbrido 2.0',
          pieza_categoria: 'Motor',
          pieza_proveedor: 'Kestrel',
          pieza_etiquetas: ['híbrido'],
        },
      },
      {
        id: 'motor_v6',
        type: 'pieza',
        values: {
          pieza_nombre: 'Motor V6 3.0',
          pieza_categoria: 'Motor',
          pieza_proveedor: 'Aurora',
          pieza_etiquetas: ['gasolina', 'alto rendimiento'],
        },
      },
      {
        id: 'caja_dct',
        type: 'pieza',
        values: { pieza_nombre: 'Caja de cambios DCT 7', pieza_categoria: 'Transmisión', pieza_proveedor: 'Getrix' },
      },
      {
        id: 'frenos_c',
        type: 'pieza',
        values: {
          pieza_nombre: 'Frenos cerámicos',
          pieza_categoria: 'Frenos',
          pieza_proveedor: 'Brembor',
          pieza_etiquetas: ['alto rendimiento'],
        },
      },
      {
        id: 'pantalla',
        type: 'pieza',
        values: { pieza_nombre: 'Pantalla central 12"', pieza_categoria: 'Electrónica', pieza_proveedor: 'Visum' },
      },
      {
        id: 'adas',
        type: 'pieza',
        values: {
          pieza_nombre: 'Asistente de carril',
          pieza_categoria: 'Electrónica',
          pieza_proveedor: 'Visum',
          pieza_etiquetas: ['seguridad'],
        },
      },
    ],
    relations: [
      { type: 'monta', from: 'corsa', to: 'motor_t14', values: { monta_desde: 2023 } },
      { type: 'monta', from: 'corsa', to: 'caja_dct' },
      { type: 'monta', from: 'corsa', to: 'pantalla' },
      { type: 'monta', from: 'cumbre', to: 'motor_h20' },
      { type: 'monta', from: 'cumbre', to: 'adas' },
      { type: 'monta', from: 'cumbre', to: 'pantalla' },
      { type: 'monta', from: 'luna', to: 'motor_t14' },
      { type: 'monta', from: 'luna', to: 'pantalla' },
      { type: 'monta', from: 'stella', to: 'motor_v6' },
      { type: 'monta', from: 'stella', to: 'frenos_c' },
      { type: 'monta', from: 'stella', to: 'caja_dct' },
      { type: 'monta', from: 'kite', to: 'motor_t14' },
      { type: 'monta', from: 'ridge', to: 'motor_h20' },
      { type: 'monta', from: 'ridge', to: 'adas' },
      { type: 'compite', from: 'corsa', to: 'luna' },
      { type: 'compite', from: 'cumbre', to: 'ridge' },
    ],
    lenses: [
      {
        id: 'lens_cars_piezas',
        name: 'Qué monta cada modelo',
        view: { hiddenRelationTypeIds: ['compite'], layout: 'force' },
      },
      {
        id: 'lens_cars_rivales',
        name: 'Rivales',
        view: { hiddenEntityTypeIds: ['pieza'], hiddenRelationTypeIds: ['monta'], layout: 'force' },
      },
    ],
    queries: [
      {
        id: 'q_cars_sin_piezas',
        name: 'Modelos sin piezas',
        typeId: 'modelo',
        conditions: [{ kind: 'relation', typeId: 'monta', presence: 'lacks', end: 'source' }],
      },
    ],
  });
}
