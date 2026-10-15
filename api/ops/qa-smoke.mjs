// Prueba de humo de la API de desarrollo contra la plataforma de QA (ecosistema-kit/MIGRACION.md, paso 7).
// Pide tokens reales con las sesiones de las cuentas de prueba de QA (.runtime/cuentas-prueba-qa.json,
// privado) y comprueba cómo responde la API a cada caso. Nunca imprime tokens ni sesiones.
//
//   node ops/qa-smoke.mjs [http://127.0.0.1:5013]

import { readFileSync, writeFileSync } from 'node:fs';

const API = process.argv[2] ?? 'http://127.0.0.1:5013';
const FILE = new URL('../.runtime/cuentas-prueba-qa.json', import.meta.url);
const USER_AGENT = 'nodaria-api-pruebas/1.0';
const sessions = JSON.parse(readFileSync(FILE, 'utf8'));

/** Renueva la sesión nativa de una cuenta; guarda el refresh nuevo antes de usar los tokens. */
async function tokensFor(name) {
  const account = sessions.cuentas[name];
  if (typeof account?.refresh !== 'string') return { status: 'sin_sesion' };
  const response = await fetch(`${sessions.plataforma}/v1/sesion/nativa/renovacion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ refresh: account.refresh, web: sessions.web }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { status: `renovacion_${response.status}_${body.code ?? body.error ?? ''}` };
  if (typeof body.refresh === 'string' && body.refresh !== account.refresh) {
    account.refresh = body.refresh;
    writeFileSync(FILE, `${JSON.stringify(sessions, null, 2)}\n`);
  }
  return { status: 'ok', tokens: body.tokens ?? {}, keys: Object.keys(body.tokens ?? {}) };
}

async function call(method, path, token, payload) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, code: body?.error, body };
}

const project = id => ({
  document: { id, name: 'Prueba QA', updatedAt: new Date().toISOString(), schemas: [], nodes: [], relations: [] },
  baseVersion: 0,
});

const report = {};
for (const name of Object.keys(sessions.cuentas)) {
  const got = await tokensFor(name);
  if (got.status !== 'ok') {
    report[name] = { tokens: got.status };
    continue;
  }
  const token = got.tokens.api?.token;
  const me = await call('GET', '/api/me', token);
  const list = await call('GET', '/api/projects', token);
  const id = `qa-${name}`;
  const put = await call('PUT', `/api/projects/${id}`, token, project(id));
  if (put.status === 200) await call('DELETE', `/api/projects/${id}?baseVersion=${put.body.version}`, token);
  report[name] = {
    tokens: got.keys.join(','),
    me: me.status === 200 ? { status: 200, restricciones: me.body.restrictions, normas: me.body.rulesPending } : me,
    proyectos: list.status === 200 ? 200 : `${list.status} ${list.code}`,
    crear: put.status === 200 ? 200 : `${put.status} ${put.code}`,
  };
}
report.sinToken = (await call('GET', '/api/me')).status;
report.tokenFalso = (await call('GET', '/api/me', 'no-es-un-token')).code;
console.log(JSON.stringify(report, null, 2));
