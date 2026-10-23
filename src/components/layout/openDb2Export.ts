export const OPEN_DB2_EXPORT_EVENT = 'nodaria-open-db2-export';

/** Abre la exportación de Db2 for i (`Db2ExportHost`, montado en `App`). */
export const openDb2Export = () => window.dispatchEvent(new Event(OPEN_DB2_EXPORT_EVENT));
