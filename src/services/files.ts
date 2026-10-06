import type { Project } from '../domain/types';
import { serializeProject } from './storage';

/** Descarga un texto como archivo desde el navegador. */
export function downloadText(fileName: string, text: string, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Exporta un proyecto como `<nombre>.nodaria.json`. */
export function downloadProject(project: Project) {
  downloadText(`${project.name.replace(/[^a-z0-9áéíóúüñ]+/gi, '_')}.nodaria.json`, serializeProject(project));
}
