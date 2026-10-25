const csvCell = (text: string) => (/[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * Una fila de CSV separada por «;», como lo abre Excel en español, con comillas en las celdas que llevan «;»,
 * comillas o saltos de línea. Lo usan la agenda (`agendaExport.ts`) y el ZIP del proyecto (`exportBundle.ts`).
 */
export const csvRow = (cells: string[]) => cells.map(csvCell).join(';');
