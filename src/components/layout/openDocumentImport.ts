export const OPEN_DOCUMENT_IMPORT_EVENT = 'nodaria-open-document-import';

/** Abre «Importar colecciones» (`DocumentImportHost`, montado en `App`). */
export const openDocumentImport = () => window.dispatchEvent(new Event(OPEN_DOCUMENT_IMPORT_EVENT));
