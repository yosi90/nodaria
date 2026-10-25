import { describe, expect, it } from 'vitest';
import { fileSafeName } from './text';

describe('fileSafeName', () => {
  it('deja un nombre de archivo sin símbolos ni guiones bajos en los extremos', () => {
    expect(fileSafeName('Mi novela: borrador', 'proyecto')).toBe('Mi_novela_borrador');
    expect(fileSafeName('Pedidos (MongoDB)', 'proyecto')).toBe('Pedidos_MongoDB');
    expect(fileSafeName('¡¿?!', 'proyecto')).toBe('proyecto');
  });
});
