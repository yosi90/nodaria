export const OPEN_TABLES_IMPORT_EVENT = 'nodaria-open-tables-import';

/** Abre la importación de tablas desde SQL o DDS (`TablesImportHost`, montado en `App`). */
export const openTablesImport = () => window.dispatchEvent(new Event(OPEN_TABLES_IMPORT_EVENT));
