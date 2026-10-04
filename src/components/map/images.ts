const MAX_SIDE = 384;
const QUALITY = 0.85;

/** Reduce la imagen a `MAX_SIDE` px de lado mayor y la devuelve como JPEG en data URL. */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

const MAP_MAX_SIDE = 2400;

/** Carga una imagen de mapa: hasta 2400 px de lado mayor, JPEG; devuelve data URL y tamaño final. */
export async function loadMapImage(
  file: File,
): Promise<{ data: string; width: number; height: number; scale: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAP_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { data: canvas.toDataURL('image/jpeg', 0.82), width: canvas.width, height: canvas.height, scale: 1 };
}

export const isImageValue = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');
