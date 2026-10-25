import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlatformError, platformRequest, readToken, serviceRequest } from '../src/platform/http.ts';

const tokenFile = (content: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'nodaria-platform-')), 'plataforma.token');
  writeFileSync(file, content);
  return file;
};

const answering = (response: () => Response) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
};

describe('cliente de los servicios de Yosiftware', () => {
  it('lee la credencial del archivo sin espacios, o nada si no está', async () => {
    expect(await readToken(tokenFile('credencial\n'))).toBe('credencial');
    expect(await readToken(tokenFile('  \n'))).toBeNull();
    expect(await readToken(path.join(tmpdir(), 'no-existe', 'plataforma.token'))).toBeNull();
  });

  it('llama con la credencial, el User-Agent de Nodaria y las cabeceras de la ruta', async () => {
    const { impl, calls } = answering(() => Response.json({ id: 1 }));
    const data = await serviceRequest('https://qa-cuentas-api.yosiftware.es/v1/x', 'tok', 'POST', {
      body: { a: 1 },
      headers: { 'x-yosi-cuenta': 'cuenta' },
      fetch: impl,
    });
    expect(data).toEqual({ id: 1 });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers).toMatchObject({
      authorization: 'Bearer tok',
      'user-agent': 'nodaria-api/1.0',
      'content-type': 'application/json',
      'x-yosi-cuenta': 'cuenta',
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ a: 1 });

    const empty = answering(() => new Response(null, { status: 204 }));
    expect(await serviceRequest('https://x.es/', 'tok', 'DELETE', { fetch: empty.impl })).toBeNull();
    expect(empty.calls[0].init.body).toBeUndefined();
    expect(empty.calls[0].init.headers).not.toHaveProperty('content-type');
  });

  it('entiende los errores de la plataforma y los de Notificapp', async () => {
    const platform = answering(() =>
      Response.json({ code: 'sin_roles', error: 'Declara los roles.' }, { status: 409 }),
    );
    await expect(serviceRequest('https://x.es/', 'tok', 'POST', { fetch: platform.impl })).rejects.toMatchObject({
      status: 409,
      code: 'sin_roles',
      message: 'Declara los roles.',
    });
    // Sin `code`, el código es el `error` (formato de Notificapp); el texto, el `message` si no hay otro.
    const notificapp = answering(() => Response.json({ error: 'conflicto' }, { status: 409 }));
    await expect(serviceRequest('https://x.es/', 'tok', 'POST', { fetch: notificapp.impl })).rejects.toMatchObject({
      code: 'conflicto',
    });
    const described = answering(() => Response.json({ message: 'Ya existe.' }, { status: 409 }));
    await expect(serviceRequest('https://x.es/', 'tok', 'POST', { fetch: described.impl })).rejects.toMatchObject({
      code: 'error',
      message: 'Ya existe.',
    });
    const bare = answering(() => new Response('<html>', { status: 503 }));
    await expect(
      serviceRequest('https://x.es/', 'tok', 'GET', { fetch: bare.impl, service: 'Notificapp' }),
    ).rejects.toMatchObject({ status: 503, code: 'error', message: 'Notificapp respondió 503.' });
  });

  it('sin credencial de servicio no llama: 503 que se puede reintentar', async () => {
    const { impl, calls } = answering(() => Response.json({}));
    const platform = { api: 'https://qa-cuentas-api.yosiftware.es', serviceTokenFile: tokenFile('') };
    const error = await platformRequest(platform, 'GET', '/v1/servicio/cambios', { fetch: impl }).catch(e => e);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ status: 503, code: 'sin_credencial' });
    expect(calls).toHaveLength(0);
  });
});
