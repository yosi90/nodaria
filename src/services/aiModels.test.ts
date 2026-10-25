import { describe, expect, it } from 'vitest';
import { preferredModel, reachableModels, type AiModelInfo } from './ai';

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

describe('preferredModel', () => {
  const state = (texto: string | null, openai = 'lista') => ({
    proveedores: [
      { proveedor: 'anthropic', estado: 'lista' },
      { proveedor: 'openai', estado: openai },
    ],
    preferidos: { texto },
  });

  it('propone el equilibrado del proveedor preferido para el texto, si está listo', () => {
    expect(preferredModel(own, state('openai'))?.id).toBe('gpt-5.6-terra');
    expect(preferredModel(own, state('anthropic'))?.id).toBe('claude-sonnet-5-5');
    // Sin el equilibrado entre los que alcanza la clave, otro del mismo proveedor.
    expect(preferredModel(own.slice(1), state('anthropic'))?.id).toBe('claude-opus-5-5');
  });

  it('sin preferencia, con su proveedor sin clave o sin respuesta, decide Nodaria', () => {
    expect(preferredModel(own, state(null))).toBeUndefined();
    expect(preferredModel(own, state('openai', 'sin_clave_de_ia'))).toBeUndefined();
    expect(preferredModel(own, { proveedores: state(null).proveedores })).toBeUndefined();
    expect(preferredModel(own, null)).toBeUndefined();
  });
});
