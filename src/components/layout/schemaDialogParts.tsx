import { Upload } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import type { Schema } from '../../domain/types';
import { Button } from '../common/Button';

/*
 * Piezas comunes de los diálogos que crean o cambian tipos de bases de datos: importar tablas o
 * colecciones (`TablesImportDialog`, `DocumentImportDialog`) y pasar de tablas a documentos y al revés
 * (`DocumentConversionDialog`, `TableConversionDialog`).
 */

export interface SourceFile {
  name: string;
  text: string;
}

/**
 * «Subir archivos»: los que se eligen se leen como texto (hasta `maxBytes` cada uno) y sustituyen a los que
 * se llamen igual; cada uno se puede quitar. `children` va al final, como una nota.
 */
export function SourceFiles({
  files,
  onChange,
  accept,
  maxBytes,
  children,
}: {
  files: SourceFile[];
  onChange: (update: (current: SourceFile[]) => SourceFile[]) => void;
  accept: string;
  maxBytes: number;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const read = async (list: FileList | null) => {
    if (!list) return;
    const read = await Promise.all(
      [...list].filter(f => f.size <= maxBytes).map(async f => ({ name: f.name, text: await f.text() })),
    );
    onChange(current => [...current.filter(c => !read.some(r => r.name === c.name)), ...read]);
  };
  return (
    <div className="tables-import-files">
      <Button size="sm" icon={Upload} onClick={() => input.current?.click()}>
        Subir archivos
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={e => {
          void read(e.target.files);
          e.target.value = '';
        }}
      />
      {files.map(f => (
        <span key={f.name} className="chip">
          {f.name}
          <button
            type="button"
            aria-label={`Quitar ${f.name}`}
            onClick={() => onChange(current => current.filter(c => c.name !== f.name))}
          >
            ×
          </button>
        </span>
      ))}
      {children}
    </div>
  );
}

/** «Subtipo de»: el tipo del que heredan los tipos que se crean, o ninguno. */
export function BaseTypeField({
  bases,
  value,
  onChange,
  hint,
}: {
  bases: Schema[];
  value: string | null;
  onChange: (id: string | null) => void;
  hint?: ReactNode;
}) {
  return (
    <label className="field">
      Subtipo de
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
        <option value="">Ningún tipo (tipos sueltos)</option>
        {bases.map(s => (
          <option key={s.id} value={s.id}>
            {s.name || 'Sin nombre'}
          </option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Los avisos de lo que se ha leído, plegados (abiertos con `open`). */
export function ReadWarnings({ warnings, open }: { warnings: string[]; open?: boolean }) {
  if (!warnings.length) return null;
  return (
    <details className="tables-import-warnings" open={open}>
      <summary>{warnings.length === 1 ? '1 aviso' : `${warnings.length} avisos`} de lo que se ha leído</summary>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

/** Los avisos de una conversión, a la vista. */
export function ConversionWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="muted-note conversion-warnings">
      {warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

/** Por qué no se puede: el rol en el grupo no deja cambiar el esquema. */
export function SchemaLockedNote() {
  return (
    <p className="muted-note" role="status">
      Tu rol en el grupo no te deja cambiar el esquema.
    </p>
  );
}
