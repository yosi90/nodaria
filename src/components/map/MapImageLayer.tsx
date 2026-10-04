import { ViewportPortal } from '@xyflow/react';
import type { MapImage } from '../../domain/types';

/** Imagen de fondo de la disposición «Mapa», anclada en el origen del lienzo a su tamaño natural. */
export function MapImageLayer({ image }: { image: MapImage }) {
  return (
    <ViewportPortal>
      <img
        className="map-image"
        src={image.data}
        alt=""
        draggable={false}
        style={{ width: image.width * image.scale, height: image.height * image.scale }}
      />
    </ViewportPortal>
  );
}
