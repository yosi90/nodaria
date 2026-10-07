import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // La API vive en api/ con su propio proceso; su carpeta de logs tiene archivos bloqueados.
  server: { watch: { ignored: ['**/api/**'] } },
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
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
