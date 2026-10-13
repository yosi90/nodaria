import { describe, expect, it } from 'vitest';
import { templateById } from '../../domain/templates';
import { allFields } from '../../domain/selectors';
import { TYPE_ICONS, typeIcon } from './icon-catalog';

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
});
