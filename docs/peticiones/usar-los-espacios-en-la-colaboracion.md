# Petición a Nodaria: usar los espacios de la plataforma en la colaboración

Fecha: 2026-10-17
Solicitante: plataforma Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`), a petición del propietario (fase 9 de `docs/roadmaps/FINALIZADO_espacios/`).
Afecta a: `docs/roadmaps/ROADMAP_COLABORACION.md` de Nodaria (grupos de trabajo, invitaciones, chat del grupo y cambios en tiempo real).

## Contexto

Vuestra petición `acordar-invitaciones-y-tiempo-real-para-la-colaboracion-de-nodaria.md` tiene respuesta: los **espacios** de la plataforma, en QA y en producción desde el 2026-10-17 (kit 1.38). Los cinco puntos quedan así:

1. **Invitaciones por correo**: las lleva la plataforma, también el correo, con caducidad, revocación, límites, bloqueos y reenvíos sin duplicar.
2. **Destinatario con privacidad**: quien invita a un correo nunca sabe si tiene cuenta. Para aceptar, la cuenta tiene que tener ese correo confirmado (el suyo o el de su Google), y nunca se salta el registro cerrado. Nodaria no verifica identidades.
3. **Aviso a quien nunca entró en Nodaria**: la notificación de la invitación la emite la plataforma. Se acepta dentro de Nodaria.
4. **Transporte de los cambios del tablero**: el canal del espacio. La API de Nodaria publica lo que ya ha confirmado y el frontend lo recibe en orden, con recuperación al reconectar y la presencia.
5. **Permisos del chat**: cada rol lleva su permiso de chat (escribir, leer o nada), que aplica la plataforma.

Cambia el reparto de vuestro roadmap: **la pertenencia del grupo de trabajo pasa a la plataforma** (decisión del propietario del 2026-10-15), y el tablero, sus operaciones, sus revisiones y sus conflictos siguen siendo vuestros. A petición del propietario, la plataforma ha añadido a `ROADMAP_COLABORACION.md` una sección, «Puesta al día del 2026-10-17», con el reparto nuevo, una propuesta de roles y lo que cambia en cada hito, y ha marcado en «Seguimiento» que la respuesta ha llegado. No se ha tocado el resto del documento, vuestro código ni vuestro repositorio en Git.

Guías: `ecosistema-kit/ESPACIOS.md`, `FEED_DE_CAMBIOS.md`, `CHAT.md` y la lista de comprobación, «Espacios». Referencia: `docs/publica/ESPACIOS.md` de la plataforma.

## Qué necesitamos

1. **Revisar la puesta al día** y ajustar el resto de `ROADMAP_COLABORACION.md` cuando el propietario active la colaboración: lo que el documento decía de grupos, invitaciones, correo y transporte propios se sustituye por los espacios.
2. **Copiar el kit 1.38** al activarlo.
3. **Anotar en vuestro contexto** que la petición de coordinación está respondida (la plataforma la cerró el 2026-10-17, al publicar en producción).

## Comprobaciones previas

- Probado en la plataforma: la web de pruebas en Edge, con dos cuentas, crea un espacio desde su API, invita, acepta en la ventana del SDK, ve la presencia y recibe lo que su API publica en el canal, en orden y una sola vez (`webs/pruebas/api/espacios.mjs` y `webs/pruebas/src/main.ts`, por si sirven de ejemplo).
- En QA, la plataforma solo envía correos a su propio buzón: una invitación a un correo aparece en las pendientes de la cuenta que lo tiene confirmado, pero el correo no llega.

## Calendario y dependencias

Sin calendario. La colaboración se activa cuando lo decida el propietario, después de la congelación del ecosistema.

## Fuera de alcance

- Cambiar código de Nodaria.
- Los grupos sin cuenta, que seguís aplazando.

## Resolución

**Aceptada** (2026-10-17); los puntos 1 y 2 quedan para cuando el propietario active la colaboración.

1. **Puesta al día revisada**: es correcta frente a `ecosistema-kit/ESPACIOS.md` 1.38 y `docs/publica/ESPACIOS.md`. Las observaciones de Nodaria están en «Revisión de Nodaria (2026-10-17)» de `ROADMAP_COLABORACION.md`. Ninguna pide nada a la plataforma: son decisiones y trabajo de Nodaria, ya decididas por el propietario el 2026-10-17. Lector es el rol por defecto. Se acepta que quien gestiona cambie la entrada o los dos pasos desde fuera. El proyecto de un grupo es del grupo: no se borra al borrarse una cuenta (os basta vuestro traspaso automático), y al borrar el grupo, quien tiene la propiedad elige quién se queda el proyecto antes de que Nodaria borre el espacio. La clave de IA del grupo solo se usa en sus proyectos o en los que su administrador marque. También están el feed, el límite del canal y la presencia por espacio. El resto del roadmap se reescribe al activarlo.
2. **Kit 1.38**: se copia al activar (el local es el 1.32).
3. **Contexto**: anotado en `docs/codex/PROJECT_CONTEXT.md` que la petición de coordinación está respondida y que el reparto pasa a los espacios. Hitos 0 y «Seguimiento» del roadmap puestos al día (migración terminada, petición resuelta).
