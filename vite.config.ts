import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // La API vive en api/ con su propio proceso; su carpeta de logs tiene archivos bloqueados.
  server: { watch: { ignored: ['**/api/**'] } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
