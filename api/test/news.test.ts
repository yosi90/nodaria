import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { announceToYosiftware, announcementProblem } from '../src/platform/news.ts';
import { PlatformError } from '../src/platform/http.ts';

const tokenFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nodaria-news-'));
  const file = path.join(dir, 'plataforma.token');
  writeFileSync(file, 'credencial-de-prueba\n');
  return file;
};
const platform = (file: string) => ({
  env: 'qa' as const,
  api: 'https://qa-cuentas-api.yosiftware.es',
  audience: 'nodaria-api',
  serviceTokenFile: file,
  feedIntervalMs: 300000,
  feedEnabled: false,
});
const ok = {
  tipo: 'actualizacion' as const,
  idExterno: '2026-10-22-calendario',
  texto: 'Nodaria estrena el calendario: una agenda en cada proyecto.',
  enlace: 'https://nodaria.yosiftware.es/',
};

describe('novedades de Yosiftware', () => {
  it('comprueba las reglas del kit antes de anunciar', () => {
    expect(announcementProblem(ok)).toBeNull();
    expect(announcementProblem({ ...ok, texto: 'Estrenamos el calendario.' })).toMatch(/nombre de la web/);
    expect(announcementProblem({ ...ok, texto: `Nodaria ${'x'.repeat(280)}` })).toMatch(/280/);
    expect(announcementProblem({ ...ok, texto: 'Nodaria <b>nuevo</b>' })).toMatch(/HTML/);
    expect(announcementProblem({ ...ok, enlace: 'https://ejemplo.com/' })).toMatch(/yosiftware/);
    expect(announcementProblem({ ...ok, tipo: 'otra' as never })).toMatch(/Tipo/);
  });

  it('publica con la credencial de servicio y traduce los errores de la plataforma', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 7, idExterno: ok.idExterno }), { status: 201 });
    }) as unknown as typeof fetch;
    const file = tokenFile();
    expect(await announceToYosiftware(platform(file), ok, fake)).toEqual({ id: 7, idExterno: ok.idExterno });
    expect(calls[0].url).toBe('https://qa-cuentas-api.yosiftware.es/v1/servicio/novedades/yosiftware');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer credencial-de-prueba');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(ok);

    const tooMany = (async () =>
      new Response(JSON.stringify({ code: 'demasiadas_novedades', error: 'Hoy ya no.' }), {
        status: 429,
      })) as unknown as typeof fetch;
    await expect(announceToYosiftware(platform(file), ok, tooMany)).rejects.toMatchObject({
      status: 429,
      code: 'demasiadas_novedades',
    });
    await expect(announceToYosiftware(platform(file), { ...ok, texto: 'Sin nombre' }, fake)).rejects.toBeInstanceOf(
      PlatformError,
    );
  });
});
