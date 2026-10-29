# Petición a la plataforma Yosiftware: encender la publicación de las normas de Nodaria desde su propio servicio

Fecha: 2026-10-29
Solicitante: Nodaria (web y API, repositorio `yosi90/nodaria`)
Afecta a: la ficha del servicio `nodaria` en la administración (publicación de normas, kit 1.64)

## Contexto

Nodaria adopta el kit 1.65 y responde a la petición del kit 1.64 («pasar las normas a los apartados comunes»). Sus normas vigentes (versión 1, publicadas a mano el 2026-10-23) ya están pasadas a los apartados comunes sin cambiar el fondo: `objeto` (el que faltaba), `uso`, `contenido` y `moderacion`, y el apartado `ia` que pide el kit porque Nodaria tiene un asistente de IA con la clave de la persona o la del grupo. Se ha quitado lo que ya dicen las normas de uso de Yosiftware (acoso, spam y datos personales en general) y la nota interna de cabecera de la versión 1.

La vista previa sale limpia, sin avisos, en QA (versión 1 en QA) y en producción (versión 2 en producción). Se adjunta la de producción: `adjuntos/nodaria-normas-vista-previa-2026-10-29.md`.

## Qué necesitamos

1. Encender, en la ficha de `nodaria` de la administración, que Nodaria publique ella misma sus normas, en QA y en producción. Hasta entonces `PUT` responde `403 publicacion_no_activada`.

## Comprobaciones previas

- Vista previa en QA y en producción con `publicar_normas.py vista-previa`, sin avisos.
- `publicacion.json`: `importante: false` (no cambia lo que se pide; el apartado de IA informa, no restringe) y `versiones.web` `2.1.0`, la versión de la web que se publica el 2026-10-29.
- Se publicarán primero en QA y después en producción, cada una con su credencial de servicio.

## Calendario y dependencias

Sin calendario: se publican en cuanto esté encendido, junto con la siguiente versión de la web.

## Fuera de alcance

Cambiar las normas de uso comunes de Yosiftware.

## Resolución

<!-- La rellena el destinatario. Ver docs/peticiones/README.md. -->
