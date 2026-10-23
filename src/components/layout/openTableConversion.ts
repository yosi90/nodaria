export const OPEN_TABLE_CONVERSION_EVENT = 'nodaria-open-table-conversion';

/** Abre «Pasar documentos a tablas» (`TableConversionHost`, montado en `App`). */
export const openTableConversion = () => window.dispatchEvent(new Event(OPEN_TABLE_CONVERSION_EVENT));
