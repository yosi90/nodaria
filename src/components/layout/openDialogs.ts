/*
 * Diálogos que se abren desde varios sitios (el engranaje del proyecto, la paleta, el lienzo o «Registros»)
 * con un evento de `window`: cada uno lo monta un `DialogHost` en `App`.
 */

export const OPEN_DB2_EXPORT_EVENT = 'nodaria-open-db2-export';
export const OPEN_TABLES_IMPORT_EVENT = 'nodaria-open-tables-import';
export const OPEN_DOCUMENT_IMPORT_EVENT = 'nodaria-open-document-import';
export const OPEN_DOCUMENT_CONVERSION_EVENT = 'nodaria-open-document-conversion';
export const OPEN_TABLE_CONVERSION_EVENT = 'nodaria-open-table-conversion';

const opener = (event: string) => () => window.dispatchEvent(new Event(event));

/** Abre la exportación de Db2 for i (`Db2ExportDialog`). */
export const openDb2Export = opener(OPEN_DB2_EXPORT_EVENT);
/** Abre la importación de tablas desde SQL o DDS (`TablesImportDialog`). */
export const openTablesImport = opener(OPEN_TABLES_IMPORT_EVENT);
/** Abre «Importar colecciones» (`DocumentImportDialog`). */
export const openDocumentImport = opener(OPEN_DOCUMENT_IMPORT_EVENT);
/** Abre «Pasar tablas a documentos» (`DocumentConversionDialog`). */
export const openDocumentConversion = opener(OPEN_DOCUMENT_CONVERSION_EVENT);
/** Abre «Pasar documentos a tablas» (`TableConversionDialog`). */
export const openTableConversion = opener(OPEN_TABLE_CONVERSION_EVENT);
