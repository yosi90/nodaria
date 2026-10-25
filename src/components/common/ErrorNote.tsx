/** Por qué ha fallado lo último que se ha intentado (dentro de un diálogo o un panel); nada si no hay error. */
export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="group-error" role="alert">
      {message}
    </p>
  );
}
