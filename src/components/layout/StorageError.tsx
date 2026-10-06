import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '../common/Button';

/** Pantalla en lugar de la aplicación cuando no se pueden leer los datos guardados: arrancar en blanco los pondría en riesgo. */
export function StorageError({ message }: { message: string }) {
  return (
    <main className="storage-error" role="alert">
      <CircleAlert size={28} aria-hidden />
      <h1>No se pueden abrir tus proyectos</h1>
      <p>{message}</p>
      <p>
        No se ha tocado nada de lo guardado. Recarga la página; si sigue igual, cierra las demás pestañas de Nodaria y
        vuelve a intentarlo.
      </p>
      <Button variant="primary" icon={RotateCw} onClick={() => window.location.reload()}>
        Recargar
      </Button>
    </main>
  );
}
