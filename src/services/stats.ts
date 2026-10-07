/**
 * Yosiftadísticas (medición anónima de audiencia; ver `estadisticas-kit/INTEGRACION.md`).
 * El script del colector lee esta marca antes de cada envío y, si existe, no envía nada.
 * Se guarda cuando la API indica que la cuenta es del propietario y no se borra al cerrar sesión:
 * el dispositivo sigue siendo suyo.
 */
const EXCLUDE_KEY = 'yosiftadisticas:excluir';

export function excludeDeviceFromStats() {
  try {
    localStorage.setItem(EXCLUDE_KEY, '1');
  } catch {
    // Sin almacenamiento disponible no hay nada que hacer: el colector descarta además la red de casa.
  }
}
