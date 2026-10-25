/**
 * Fecha y hora de un instante (ISO) para enseñarlo: «25 oct 2026, 12:30» (`medium`), «25/10/26, 12:30»
 * (`short`) o «25 de octubre de 2026 a las 12:30» (`long`). Las fechas del mundo del proyecto van con su
 * calendario (`domain/calendar.ts`), no con esto.
 */
export const dateTimeText = (iso: string, dateStyle: 'short' | 'medium' | 'long' = 'medium') =>
  new Date(iso).toLocaleString('es-ES', { dateStyle, timeStyle: 'short' });
