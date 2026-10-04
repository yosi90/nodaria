import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { FieldValue } from '../../domain/types';
import { Button } from '../common/Button';
import { isImageValue, shrinkImage } from './images';

/** Editor de un atributo de imagen: vista previa, subir (reducida) y quitar. */
export function ImageControl({
  value,
  label,
  className = '',
  onChange,
}: {
  value: FieldValue | undefined;
  label: string;
  /** Clases de forma y borde (`imageClasses`). */
  className?: string;
  onChange: (value: FieldValue) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const image = isImageValue(value) ? value : null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await shrinkImage(file));
      setError(null);
    } catch {
      setError('No se ha podido leer la imagen.');
    }
  };

  return (
    <div className="image-control">
      {image ? (
        <img className={className} src={image} alt={label} />
      ) : (
        <button type="button" className="image-placeholder" onClick={() => input.current?.click()}>
          <ImagePlus size={20} aria-hidden />
          Subir imagen
        </button>
      )}
      <div className="image-actions">
        {image && (
          <>
            <Button size="sm" icon={ImagePlus} onClick={() => input.current?.click()}>
              Cambiar
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(null)}>
              Quitar
            </Button>
          </>
        )}
        {error && <span className="validation-message">{error}</span>}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        onChange={e => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
