import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv, type ServerOptions } from 'vite';
import { defineConfig } from 'vitest/config';
import { contentSecurityPolicy } from './src/services/csp';

/** Nombre de desarrollo de Nodaria contra la plataforma de QA (`ecosistema-kit/MIGRACION.md`, paso 7). */
const DEV_HOST = 'nodaria.dev.yosiftware.es';
const DEV_ADDRESS = '127.0.0.13';

export default defineConfig(({ mode }) => {
  // Modo `qa`: se sirve por HTTPS en nodaria.dev.yosiftware.es (127.0.0.13:443) con el certificado
  // comodín de la plataforma, y la API de desarrollo va por el proxy (mismo origen). La configuración
  // privada (rutas del certificado y de la API) está en `.env.qa.local`.
  const qa = mode === 'qa';
  const env = loadEnv(mode, import.meta.dirname, '');
  const qaServer: ServerOptions | undefined = qa
    ? {
        host: DEV_ADDRESS,
        port: 443,
        strictPort: true,
        https: { cert: readFileSync(env.DEV_CERT), key: readFileSync(env.DEV_KEY) },
        allowedHosts: [DEV_HOST],
        proxy: { '/api': { target: env.DEV_API || 'http://127.0.0.1:5013', changeOrigin: false } },
      }
    : undefined;

  return {
    plugins: [react()],
    server: {
      // La API vive en api/ con su propio proceso; su carpeta de logs tiene archivos bloqueados.
      watch: { ignored: ['**/api/**'] },
      ...qaServer,
    },
    // La vista previa de la build de QA lleva la CSP de QA: se comprueba sin violaciones en la consola.
    preview: qaServer ? { ...qaServer, headers: { 'Content-Security-Policy': contentSecurityPolicy('qa') } } : {},
    // Los textos legales son páginas estáticas propias: se leen sin cargar la aplicación.
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          privacidad: path.resolve(import.meta.dirname, 'privacidad.html'),
          condiciones: path.resolve(import.meta.dirname, 'condiciones.html'),
        },
      },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'contracts/**/*.test.ts'] },
  };
});
