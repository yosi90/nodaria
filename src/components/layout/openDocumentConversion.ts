export const OPEN_DOCUMENT_CONVERSION_EVENT = 'nodaria-open-document-conversion';

/** Abre «Pasar tablas a documentos» (`DocumentConversionHost`, montado en `App`). */
export const openDocumentConversion = () => window.dispatchEvent(new Event(OPEN_DOCUMENT_CONVERSION_EVENT));
