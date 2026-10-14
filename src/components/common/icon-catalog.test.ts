import { describe, expect, it } from 'vitest';
import { templateById } from '../../domain/templates';
import { allFields } from '../../domain/selectors';
import { iconChoices, TYPE_ICONS, typeIcon } from './icon-catalog';

describe('icon catalog compatibility', () => {
  it('preserves existing icon ids and resolves unknown icons to the generic one', () => {
    for (const id of ['user', 'book-open', 'wand-sparkles', 'calendar-days'])
      expect(typeIcon(id)).toBe(TYPE_ICONS[id].icon);
    expect(typeIcon('unknown')).toBe(TYPE_ICONS.circle.icon);
    expect(TYPE_ICONS['phosphor-phone'].label).toBe('Teléfono');
  });
  it('resolves all icons used by the new general templates', () => {
    for (const id of ['software', 'commercial', 'events', 'novel']) {
      const p = templateById(id)!.build();
      for (const schema of p.schemas) {
        expect(TYPE_ICONS[schema.icon], `${id}: ${schema.icon}`).toBeDefined();
        for (const field of allFields(p, schema.id))
          if (field.icon) expect(TYPE_ICONS[field.icon], `${id}: ${field.icon}`).toBeDefined();
      }
    }
  });
  it('offers one entry per equivalent concept and keeps old Phosphor ids available for rendering', () => {
    const choices = iconChoices();
    const concepts = choices.map(([id, entry]) => entry.equivalentTo ?? id);
    expect(new Set(concepts).size).toBe(concepts.length);
    for (const [id, entry] of Object.entries(TYPE_ICONS)) {
      if (!entry.equivalentTo) continue;
      expect(TYPE_ICONS[entry.equivalentTo]).toBeDefined();
      expect(choices.some(([choice]) => choice === entry.equivalentTo)).toBe(true);
      expect(choices.some(([choice]) => choice === id)).toBe(false);
      expect(typeIcon(id)).toBe(entry.icon);
      const selected = iconChoices('', 'all', id);
      expect(selected.some(([choice]) => choice === id)).toBe(true);
      expect(selected.some(([choice]) => choice === entry.equivalentTo)).toBe(false);
    }
  });
  it('finds grouped aliases without accents and still allows filtering by package', () => {
    expect(iconChoices('correo electronico').map(([id]) => id)).toEqual(['mail']);
    expect(iconChoices('correo electronico', 'Phosphor').map(([id]) => id)).toEqual(['phosphor-mail']);
    expect(iconChoices('mantenimiento', 'Lucide').map(([id]) => id)).toEqual(['wrench']);
    expect(iconChoices('NUMEROS').map(([id]) => id)).toContain('hash');
    expect(iconChoices('camino nodos').map(([id]) => id)).toEqual(['route']);
  });
});
