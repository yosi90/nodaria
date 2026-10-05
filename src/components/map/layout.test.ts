import { describe, expect, it } from 'vitest';
import { node, project, relation, schema } from '../../test/fixtures';
import { forceLayout, genealogyLayout, hierarchySatellites, NODE_H, NODE_W, radialLayout, treeLayout } from './layout';

const world = () =>
  project({
    schemas: [schema('t'), schema('vive', { structural: true, parentEnd: 'target' }, 'relationship')],
    nodes: [
      node('reino', 't'),
      node('ciudad', 't', 'reino'),
      node('a', 't', 'ciudad'),
      node('b', 't', 'ciudad'),
      node('suelto', 't'),
    ],
    relations: [relation('r1', 'vive', 'a', 'reino'), relation('r2', 'vive', 'b', 'reino')],
  });

describe('disposiciones', () => {
  it('la jerárquica coloca cada nivel en una columna y nunca pierde nodos', () => {
    const pos = treeLayout(world(), null);
    expect(pos.size).toBe(5);
    expect(pos.get('reino')!.x).toBe(0);
    expect(pos.get('ciudad')!.x).toBeGreaterThan(NODE_W);
    expect(pos.get('a')!.x).toBe(pos.get('b')!.x);
    expect(pos.get('a')!.y).not.toBe(pos.get('b')!.y);
  });

  it('con una relación estructural los nodos cuelgan del extremo superior', () => {
    const pos = treeLayout(world(), 'vive');
    expect(pos.get('a')!.x).toBeGreaterThan(pos.get('reino')!.x);
    expect(pos.get('ciudad')!.x).toBe(0);
  });

  it('un ciclo en la jerarquía no cuelga el cálculo ni pierde nodos', () => {
    const p = project({ schemas: [schema('t')], nodes: [node('x', 't', 'y'), node('y', 't', 'x')] });
    expect(treeLayout(p, null).size).toBe(2);
  });

  it('la de fuerzas es determinista y separa los nodos', () => {
    const p = world();
    const links = p.relations.map(r => ({ a: r.sourceId, b: r.targetId }));
    const one = forceLayout(p, links);
    const two = forceLayout(p, links);
    expect([...one.entries()]).toEqual([...two.entries()]);
    const points = [...one.values()];
    points.forEach((a, i) =>
      points.slice(i + 1).forEach(b => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_W * 0.8)),
    );
  });

  it('la de fuerzas respeta los nodos fijados y acomoda el resto sin pisarlos', () => {
    const p = world();
    const links = p.relations.map(r => ({ a: r.sourceId, b: r.targetId }));
    const fixed = new Map([
      ['reino', { x: 300, y: 300 }],
      ['ciudad', { x: 420, y: 320 }],
    ]);
    const pos = forceLayout(p, links, null, fixed);
    expect(pos.get('reino')).toEqual({ x: 300, y: 300 });
    expect(pos.get('ciudad')).toEqual({ x: 420, y: 320 });
    const free = ['a', 'b', 'suelto'].map(id => pos.get(id)!);
    const overlaps = (m: { x: number; y: number }, n: { x: number; y: number }) =>
      Math.abs(m.x - n.x) < NODE_W && Math.abs(m.y - n.y) < NODE_H;
    free.forEach(f =>
      [...fixed.values(), ...free.filter(o => o !== f)].forEach(o => expect(overlaps(f, o)).toBe(false)),
    );
  });

  it('la radial pone el foco en el centro y los no conectados debajo', () => {
    const p = world();
    const links = p.relations.map(r => ({ a: r.sourceId, b: r.targetId }));
    const pos = radialLayout(p, 'reino', links);
    const reino = pos.get('reino')!;
    const ya = pos.get('a')!;
    expect(Math.hypot(ya.x - reino.x, ya.y - reino.y)).toBeGreaterThan(200);
    expect(pos.get('suelto')!.y).toBeGreaterThan(reino.y);
  });
});

describe('genealogía', () => {
  it('la disposición vertical pone cada generación en una fila', () => {
    const pos = treeLayout(world(), null, true);
    expect(pos.get('reino')!.y).toBe(0);
    expect(pos.get('ciudad')!.y).toBeGreaterThan(pos.get('reino')!.y);
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y);
    expect(pos.get('a')!.x).not.toBe(pos.get('b')!.x);
  });

  it('usa el parentesco aunque la estructura elegida sea otra, y pone a los hermanos en la misma fila', () => {
    const p = project({
      schemas: [schema('t'), schema('familia', { genealogical: true }, 'relationship'), schema('lugar')],
      nodes: [node('madre', 't'), node('hija', 't'), node('hijo', 't'), node('tio', 't'), node('ciudad', 'lugar')],
      relations: [
        { ...relation('f1', 'familia', 'madre', 'hija'), kinshipId: 'progenitor' },
        { ...relation('f2', 'familia', 'hija', 'hijo'), kinshipId: 'hermano' },
        { ...relation('f3', 'familia', 'tio', 'hija'), kinshipId: 'tio' },
      ],
    });
    const pos = genealogyLayout(p, null);
    expect(pos.get('hija')!.y).toBeGreaterThan(pos.get('madre')!.y);
    expect(pos.get('hijo')!.y).toBe(pos.get('hija')!.y);
    expect(pos.get('hijo')!.x).not.toBe(pos.get('hija')!.x);
    expect(pos.get('tio')!.y).toBe(pos.get('madre')!.y);
    expect(pos.get('ciudad')!.y).toBeGreaterThan(pos.get('hija')!.y);
  });

  it('coloca a las parejas juntas, a los hijos centrados debajo y a los hermanos contiguos', () => {
    const p = project({
      schemas: [schema('t'), schema('familia', { genealogical: true }, 'relationship'), schema('lugar')],
      nodes: [
        node('arnold', 't'),
        node('obkea', 't'),
        node('guayota', 't'),
        node('achaman', 't'),
        node('kunoa', 't'),
        node('araluna', 't'),
        node('ciudad', 'lugar'),
      ],
      relations: [
        { ...relation('m', 'familia', 'arnold', 'obkea'), kinshipId: 'conyuge' },
        { ...relation('h1', 'familia', 'arnold', 'guayota'), kinshipId: 'progenitor' },
        { ...relation('h2', 'familia', 'obkea', 'guayota'), kinshipId: 'progenitor' },
        { ...relation('h3', 'familia', 'arnold', 'achaman'), kinshipId: 'progenitor' },
        { ...relation('h4', 'familia', 'obkea', 'achaman'), kinshipId: 'progenitor' },
        { ...relation('s', 'familia', 'kunoa', 'obkea'), kinshipId: 'sobrino' },
        { ...relation('e', 'familia', 'araluna', 'obkea'), kinshipId: 'hijastro' },
      ],
    });
    const pos = genealogyLayout(p, null);
    const at = (id: string) => pos.get(id)!;
    // Pareja en la misma fila y contigua
    expect(at('arnold').y).toBe(at('obkea').y);
    expect(Math.abs(at('arnold').x - at('obkea').x)).toBeLessThan(NODE_W + 120);
    // Hijos, hijastra y sobrina una fila más abajo
    ['guayota', 'achaman', 'araluna', 'kunoa'].forEach(id => expect(at(id).y).toBeGreaterThan(at('arnold').y));
    expect(new Set(['guayota', 'achaman', 'araluna', 'kunoa'].map(id => at(id).y)).size).toBe(1);
    // Los hijos comunes quedan centrados bajo la pareja
    const coupleCenter = (at('arnold').x + at('obkea').x) / 2;
    const kidsCenter = (at('guayota').x + at('achaman').x) / 2;
    expect(Math.abs(coupleCenter - kidsCenter)).toBeLessThan(NODE_W);
    // Nadie se pisa y la ciudad va en su propia fila, debajo
    const all = [...pos.entries()];
    all.forEach(([a, m]) =>
      all.forEach(
        ([b, n]) => a !== b && expect(Math.abs(m.x - n.x) >= NODE_W || Math.abs(m.y - n.y) >= NODE_H).toBe(true),
      ),
    );
    expect(at('ciudad').y).toBeGreaterThan(at('guayota').y);
  });

  it('un progenitor queda siempre por encima de sus hijos aunque otra relación lo contradiga', () => {
    const p = project({
      schemas: [schema('t'), schema('familia', { genealogical: true }, 'relationship')],
      nodes: [node('obkea', 't'), node('drokka', 't'), node('kunoa', 't'), node('araluna', 't')],
      relations: [
        { ...relation('a', 'familia', 'obkea', 'drokka'), kinshipId: 'hermano' },
        { ...relation('b', 'familia', 'kunoa', 'obkea'), kinshipId: 'sobrino' },
        // guardada al revés: Araluna como madrastra de Obkea
        { ...relation('c', 'familia', 'araluna', 'obkea'), kinshipId: 'padrastro' },
        { ...relation('d', 'familia', 'drokka', 'kunoa'), kinshipId: 'progenitor' },
      ],
    });
    const pos = genealogyLayout(p, null);
    const at = (id: string) => pos.get(id)!;
    expect(at('kunoa').y).toBeGreaterThan(at('drokka').y);
    expect(at('obkea').y).toBe(at('drokka').y);
    // La relación al revés se ve al revés: Araluna por encima de Obkea, no escondida en otra fila.
    expect(at('araluna').y).toBeLessThan(at('obkea').y);
  });
});

describe('satélites de la jerarquía', () => {
  const cars = () =>
    project({
      schemas: [
        schema('marca', { allowedChildTypeIds: ['modelo'] }),
        schema('modelo'),
        schema('pieza'),
        schema('monta', {}, 'relationship'),
      ],
      nodes: [
        node('ibex', 'marca'),
        node('corsa', 'modelo', 'ibex'),
        node('cumbre', 'modelo', 'ibex'),
        node('motor', 'pieza'),
        node('pantalla', 'pieza'),
        node('huerfana', 'pieza'),
      ],
      relations: [
        relation('r1', 'monta', 'corsa', 'motor'),
        relation('r2', 'monta', 'cumbre', 'motor'),
        relation('r3', 'monta', 'corsa', 'pantalla'),
      ],
    });
  const links = () => [
    { a: 'corsa', b: 'motor' },
    { a: 'cumbre', b: 'motor' },
    { a: 'corsa', b: 'pantalla' },
  ];

  it('detecta como satélites las raíces hoja con vínculos, no las sueltas de verdad', () => {
    expect([...hierarchySatellites(cars(), null, links())].sort()).toEqual(['motor', 'pantalla']);
  });

  it('coloca los satélites un nivel más allá de sus vecinos, a su altura y sin pisarse', () => {
    const pos = treeLayout(cars(), null, false, NODE_H, links());
    expect(pos.size).toBe(6);
    const col = pos.get('corsa')!.x + NODE_W + 110;
    expect(pos.get('motor')!.x).toBe(col);
    expect(pos.get('pantalla')!.x).toBe(col);
    // El motor queda entre sus dos modelos; la pantalla, cerca del Corsa pero sin solapar al motor.
    const mid = (pos.get('corsa')!.y + pos.get('cumbre')!.y) / 2;
    expect(Math.abs(pos.get('motor')!.y - mid)).toBeLessThan(1);
    expect(Math.abs(pos.get('pantalla')!.y - pos.get('motor')!.y)).toBeGreaterThanOrEqual(NODE_H + 34);
    // La pieza sin vínculos sigue en la columna de raíces.
    expect(pos.get('huerfana')!.x).toBe(0);
  });

  it('se puede desactivar y entonces todas las raíces van a la primera columna', () => {
    const pos = treeLayout(cars(), null, false, NODE_H, links(), false);
    expect(pos.get('motor')!.x).toBe(0);
  });

  it('la condición se propaga en cadena: una raíz hoja vinculada solo a un satélite también lo es', () => {
    // El proveedor solo se vincula al motor (satélite): queda un nivel más allá del motor, a su altura.
    const p = cars();
    p.schemas.push(schema('proveedor'), schema('fabrica', {}, 'relationship'));
    p.nodes.push(node('acme', 'proveedor'), node('nadie', 'proveedor'));
    p.relations.push(relation('r4', 'fabrica', 'acme', 'motor'));
    const all = [...links(), { a: 'acme', b: 'motor' }];
    expect([...hierarchySatellites(p, null, all)].sort()).toEqual(['acme', 'motor', 'pantalla']);
    const pos = treeLayout(p, null, false, NODE_H, all);
    expect(pos.get('acme')!.x).toBe(pos.get('motor')!.x + NODE_W + 110);
    expect(pos.get('acme')!.y).toBe(pos.get('motor')!.y);
    expect(pos.get('nadie')!.x).toBe(0);
  });

  it('un satélite va un nivel más allá de la mediana de sus vecinos, no del más profundo', () => {
    // El aceite se vincula a la marca (columna 0), al Corsa y al Cumbre (columna 1): mediana columna 1 → columna 2.
    const p = cars();
    p.schemas.push(schema('usa', {}, 'relationship'));
    p.nodes.push(node('aceite', 'pieza'));
    const all = [
      { a: 'aceite', b: 'ibex' },
      { a: 'aceite', b: 'corsa' },
      { a: 'aceite', b: 'cumbre' },
    ];
    const pos = treeLayout(p, null, false, NODE_H, all);
    expect(pos.get('aceite')!.x).toBe(pos.get('corsa')!.x + NODE_W + 110);
  });
});

describe('orden de los hermanos en la jerárquica', () => {
  it('acerca cada rama a aquello con lo que se relaciona, y deja en su orden a las que no tienen vínculos', () => {
    const p = project({
      schemas: [schema('t'), schema('usa', {}, 'relationship')],
      nodes: [
        node('r', 't'),
        node('a', 't', 'r'),
        node('b', 't', 'r'),
        node('c', 't', 'r'),
        node('k', 't'),
        node('kc', 't', 'k'),
      ],
      relations: [relation('r1', 'usa', 'a', 'kc')],
    });
    const links = [{ a: 'a', b: 'kc' }];
    const pos = treeLayout(p, null, false, NODE_H, links);
    const dist = (id: string) => Math.abs(pos.get(id)!.y - pos.get('kc')!.y);
    // «a» era el primer hermano y el más lejano de «kc»; ahora es el más cercano. «b» y «c» siguen en su orden.
    expect(dist('a')).toBeLessThan(dist('b'));
    expect(dist('a')).toBeLessThan(dist('c'));
    expect(pos.get('b')!.y).toBeLessThan(pos.get('c')!.y);
    // Las raíces y los niveles no cambian.
    expect(pos.get('r')!.x).toBe(0);
    expect(pos.get('k')!.x).toBe(0);
    expect(pos.get('a')!.x).toBe(pos.get('kc')!.x);
  });

  it('sin vínculos conserva el orden de creación', () => {
    const pos = treeLayout(world(), null);
    expect(pos.get('a')!.y).toBeLessThan(pos.get('b')!.y);
  });
});
