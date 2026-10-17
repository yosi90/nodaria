import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { exportBundle } from './exportBundle';
import { crc32, createZip, dataUrlBytes } from './zip';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const p = project({
  name: 'Novela',
  schemas: [
    schema('persona', {
      name: 'Persona',
      fields: [
        field('nombre', { isTitle: true }),
        field('edad', { label: 'Edad', type: 'number' }),
        field('amigo', { label: 'Amigo', type: 'nodeRef' }),
        field('foto', { label: 'Foto', type: 'image' }),
      ],
    }),
    schema('amistad', { name: 'Amistad' }, 'relationship'),
  ],
  nodes: [
    node('ana', 'persona', null, { nombre: 'Ana; "la mayor"', edad: 30, amigo: 'luis', foto: PIXEL }),
    { ...node('luis', 'persona', 'ana', { nombre: 'Luis' }), notes: 'Hermano de [[Ana]].' },
  ],
  relations: [relation('r1', 'amistad', 'ana', 'luis')],
});

describe('zip', () => {
  it('calcula el CRC-32 estándar y arma un ZIP con su firma', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = createZip([{ name: 'a.txt', data: 'hola' }], new Date('2026-10-17T12:00:00'));
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...zip.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    expect(dataUrlBytes(PIXEL)).toMatchObject({ extension: 'png' });
  });
});

describe('exportBundle', () => {
  it('lleva el JSON, un CSV por tipo, las relaciones, una nota por nodo y las imágenes', () => {
    const entries = exportBundle(p);
    const byName = new Map(entries.map(e => [e.name, e.data]));
    expect([...byName.keys()].sort()).toEqual(
      [
        'Novela.nodaria.json',
        'csv/Persona.csv',
        'csv/relaciones.csv',
        'imagenes/Ana; la mayor - Foto.png',
        'notas/Ana; la mayor.md',
        'notas/Luis.md',
      ].sort(),
    );
    const csv = byName.get('csv/Persona.csv') as string;
    expect(csv.startsWith('﻿Título;Dentro de;Edad;Amigo;Foto;Notas')).toBe(true);
    // El «;» y las comillas del título van entre comillas; la referencia, por título; la imagen, su archivo.
    expect(csv).toContain('"Ana; ""la mayor""";;30;Luis;"imagenes/Ana; la mayor - Foto.png";');
    const note = byName.get('notas/Luis.md') as string;
    expect(note).toContain('dentro_de: "[[Ana; la mayor]]"');
    expect(note).toContain('Hermano de [[Ana]].');
    expect(note).toContain('## Relaciones');
    expect(byName.get('notas/Ana; la mayor.md')).toContain('Amigo: "[[Luis]]"');
  });
});
