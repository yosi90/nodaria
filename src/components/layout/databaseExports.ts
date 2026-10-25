import { projectEngines, tableTypes } from '../../domain/database';
import { firestoreRules } from '../../domain/firestoreRules';
import { mongoScript } from '../../domain/mongoScript';
import { neo4jSchema } from '../../domain/neo4j';
import { fileSafeName } from '../../domain/text';
import type { Project } from '../../domain/types';
import { downloadSqlScript, downloadText } from '../../services/files';
import { openDb2Export } from './openDialogs';

/**
 * Las exportaciones de las bases de datos del proyecto, cada una solo si el proyecto usa ese motor: las
 * ofrecen el engranaje del proyecto (`Topbar`) y el menú de exportar del lienzo (`ExportMenu`).
 */
export function databaseExports(project: Project): { label: string; onSelect: () => void }[] {
  const engines = projectEngines(project);
  const fileBase = fileSafeName(project.name, 'proyecto');
  return [
    ...(tableTypes(project, 'db2i').length ? [{ label: 'Exportar Db2 for i (IBM i)…', onSelect: openDb2Export }] : []),
    ...(tableTypes(project, 'sqlserver').length
      ? [{ label: 'Exportar SQL Server (.sql)', onSelect: () => downloadSqlScript(project) }]
      : []),
    // Bases no relacionales (ROADMAP_NOSQL.md).
    ...(engines.has('mongodb')
      ? [
          {
            label: 'Exportar MongoDB (.js para mongosh)',
            onSelect: () => downloadText(`${fileBase}.mongodb.js`, mongoScript(project), 'text/javascript'),
          },
        ]
      : []),
    ...(engines.has('firestore')
      ? [
          {
            label: 'Exportar reglas de Firestore',
            onSelect: () => downloadText('firestore.rules', firestoreRules(project), 'text/plain'),
          },
        ]
      : []),
    ...(engines.has('neo4j')
      ? [
          {
            label: 'Exportar esquema de Neo4j (.cypher)',
            onSelect: () => downloadText(`${fileBase}.esquema.cypher`, neo4jSchema(project), 'text/plain'),
          },
        ]
      : []),
  ];
}
