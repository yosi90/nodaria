/**
 * Registra el service worker (`public/sw.js`) para abrir la web sin conexión. Solo en el build: en
 * desarrollo guardaría archivos que cambian a cada momento.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
