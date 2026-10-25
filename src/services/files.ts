import { sqlScript } from '../domain/sqlScript';
import { fileSafeName } from '../domain/text';
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

/** Descarga bytes (un ZIP, por ejemplo) como archivo. */
export function downloadBytes(fileName: string, bytes: Uint8Array, type = 'application/zip') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Exporta un proyecto como `<nombre>.nodaria.json`. */
export function downloadProject(project: Project) {
  downloadText(`${fileSafeName(project.name, 'proyecto')}.nodaria.json`, serializeProject(project));
}

/** Descarga el script de SQL Server de las tablas del proyecto (`<nombre>.sql`). */
export function downloadSqlScript(project: Project) {
  downloadText(`${fileSafeName(project.name, 'proyecto')}.sql`, sqlScript(project), 'application/sql');
}
