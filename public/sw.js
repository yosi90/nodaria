/*
 * Service worker de Nodaria: deja abrir la web sin conexión (PENDIENTES.md, Fase 7). Los proyectos ya
 * viven en IndexedDB y la sincronización reintenta al volver la conexión; aquí solo se guardan los
 * archivos de la propia web.
 *
 * - Solo atiende peticiones GET del mismo origen. Todo lo demás (la API, la plataforma, su SDK y el
 *   script y los envíos de Yosiftadísticas) va directo a la red sin pasar por aquí
 *   (estadisticas-kit/INTEGRACION.md: no cachear `s.js` ni interceptar los envíos al colector).
 * - Páginas: primero la red (siempre la versión publicada) y, sin conexión, la última guardada.
 * - `/assets/` llevan el contenido en el nombre: se sirven de la caché si están y, si no, de la red.
 * - Al instalarse guarda la página y los archivos que cita, para que funcione sin conexión desde la
 *   primera visita; al publicar otra versión, la página nueva sustituye a la anterior y se borran los
 *   archivos que ya no cita.
 */
const CACHE = 'nodaria-v1';
const SHELL = '/index.html';
const STATIC = ['/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

const assetsOf = html => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
// Las fuentes latinas que cita la hoja de estilos (las demás escrituras se descargan si hacen falta).
const fontsOf = css => [...css.matchAll(/url\((\/assets\/[^)]*latin[^)]*\.woff2)\)/g)].map(m => m[1]);

async function storeShell(cache, response) {
  const html = await response.clone().text();
  await cache.put(SHELL, response);
  return assetsOf(html);
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(SHELL, { cache: 'no-cache' });
      if (response.ok) {
        const assets = await storeShell(cache, response);
        await cache.addAll(assets);
        for (const css of assets.filter(path => path.endsWith('.css'))) {
          const sheet = await cache.match(css);
          if (sheet) await cache.addAll(fontsOf(await sheet.text())).catch(() => undefined);
        }
      }
      await cache.addAll(STATIC).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/**
 * Tras descargar una página nueva, quita el código y los estilos de versiones anteriores que ya no cita.
 * Las fuentes se quedan: cambian muy poco y las cita la hoja de estilos, no la página.
 */
async function pruneAssets(cache, current) {
  const keep = new Set(current.map(path => new URL(path, self.location.origin).href));
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && /\.(js|css)$/.test(path) && !keep.has(request.url)) await cache.delete(request);
  }
}

async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Solo la aplicación (todas las rutas sirven index.html); los textos legales se guardan aparte.
    const path = new URL(request.url).pathname;
    if (response.ok && !/\.html?$|^\/(privacidad|condiciones)$/.test(path)) {
      const current = await storeShell(cache, response.clone());
      if (current.length) await pruneAssets(cache, current);
    } else if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) ?? (await cache.match(SHELL)) ?? Promise.reject(error);
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') || STATIC.includes(url.pathname))
    event.respondWith(asset(request));
});
