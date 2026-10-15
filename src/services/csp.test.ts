import { describe, expect, it } from 'vitest';
import firebase from '../../firebase.json';
import { contentSecurityPolicy } from './csp';

describe('Content-Security-Policy', () => {
  it('Firebase Hosting sirve en producción la misma CSP que genera csp.ts', () => {
    const header = firebase.hosting.headers
      .find(h => h.source === '**')
      ?.headers.find(h => h.key === 'Content-Security-Policy');
    expect(header?.value).toBe(contentSecurityPolicy('produccion'));
  });

  it('admite la plataforma y Yosiftadísticas de su entorno, sin «unsafe-inline» ni otros entornos', () => {
    const production = contentSecurityPolicy('produccion');
    expect(production).toContain("script-src 'self' https://cuentas.yosiftware.es https://estadisticas.yosiftware.es");
    expect(production).toContain('wss://cuentas-ws.yosiftware.es');
    expect(production).toContain('frame-src https://cuentas.yosiftware.es');
    expect(production).not.toContain('unsafe-inline');
    expect(production).not.toContain('qa-');
    const qa = contentSecurityPolicy('qa');
    expect(qa).toContain('frame-src https://qa-cuentas.yosiftware.es');
    expect(qa).not.toContain('https://cuentas.yosiftware.es ');
  });
});
