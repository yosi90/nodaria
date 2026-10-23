import { describe, expect, it } from 'vitest';
import { reachableModels, type AiModelInfo } from './ai';

const own: AiModelInfo[] = [
  { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'equilibrado' },
  { provider: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'calidad' },
  { provider: 'openai', id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', tier: 'equilibrado' },
];

describe('reachableModels', () => {
  it('solo ofrece los modelos de Nodaria que alcanza la clave según la plataforma', () => {
    const platform = {
      proveedores: [
        { proveedor: 'anthropic', modelos: [{ id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5' }], error: null },
        { proveedor: 'openai', modelos: [], error: 'sin_clave_de_ia' },
      ],
    };
    expect(reachableModels(own, platform).map(m => m.id)).toEqual(['claude-sonnet-5-5']);
  });

  it('descarta los que no son de texto y los que no tienen precio en la tabla', () => {
    const platform = {
      proveedores: [
        {
          proveedor: 'anthropic',
          modelos: [
            { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5', usos: ['texto'], precio: null },
            { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5', usos: ['texto'], precio: { entrada: 1 } },
          ],
          error: null,
        },
        {
          proveedor: 'openai',
          modelos: [{ id: 'gpt-5.6-terra', nombre: 'GPT-5.6 Terra', usos: ['transcripcion'], precio: { minuto: 1 } }],
          error: null,
        },
      ],
    };
    expect(reachableModels(own, platform).map(m => m.id)).toEqual(['claude-opus-5-5']);
  });

  it('sin respuesta de la plataforma, los de Nodaria (nunca texto libre)', () => {
    expect(reachableModels(own, null)).toEqual(own);
  });
});
