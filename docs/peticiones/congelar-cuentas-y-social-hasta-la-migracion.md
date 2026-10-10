# Petición a las webs con cuentas: congelar cuentas, perfil, social, chat y notificaciones hasta su migración

Fecha: 2026-10-07
Solicitante: plataforma común de Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`)
Destinatarios: Libros (API y frontend), Fichas (API y frontend), Nodaria, Lorcana y Poke-Voice
Afecta a: inicio de sesión y cuentas, perfil y ajustes de usuario, amistades, seguimientos y bloqueos, mensajería y chat, notificaciones y push, peticiones y errores de usuarios, moderación de cuentas y normas. Tanto en la API como en el frontend.

## Contexto

El 2026-10-07 el propietario decidió crear una plataforma común para todas las webs de `*.yosiftware.es`. Dará una cuenta única con inicio de sesión compartido (entrar en una web será entrar en todas), perfil, amistades y bloqueos, mensajería y chat en vivo, un hub de notificaciones, peticiones y errores, moderación de cuentas y normas. Ninguna web gestionará ya su propio inicio de sesión ni estos sistemas: los usará a través de la plataforma y de su kit de integración.

Cada web conserva sus datos propios (biblioteca, fichas y campañas, mapas mentales, mazos, partidas…) y sus comunidades (clubes, campañas, LFG…). Ninguna web perderá campos ni funciones que use hoy, porque el perfil de la plataforma será la suma de los de todas.

El plan es construir y dejar operativa toda la plataforma primero, y después migrar las webs una a una: Lorcana o Poke-Voice como ensayo, y luego Nodaria, Fichas y Libros. Cada web recibirá entonces su propia guía de migración, para que no se pierda nada, y sus peticiones se atenderán en ese momento. **Hasta entonces nada cambia en vuestro funcionamiento actual.**

## Qué necesitamos

1. **No añadir funciones nuevas en esas áreas**, ni en la API ni en el frontend, hasta que vuestra web se migre. Corregir errores y mantener lo que existe sí está permitido. Si no, migraríamos algo que no deja de moverse y se perdería trabajo.
2. **No borrar ni transformar datos de esas áreas**, en especial las cuentas del propietario y sus roles de administrador, que la migración tiene que conservar.
3. **Si surge una necesidad en esas áreas, enviadla como petición a la plataforma** (`C:\Users\Yosi\Desktop\administracion yosiftware\docs\peticiones\`) en lugar de implementarla aquí. Se tendrá en cuenta al construirla.
4. **Las comunidades propias pueden seguir evolucionando**, pero conviene no ampliar su dependencia de las amistades, los seguimientos y los bloqueos locales. Si una mejora la necesita, consultadlo antes con una petición.
5. **Anotad la congelación en vuestro contexto vivo** (por ejemplo, `PROJECT_CONTEXT.md`) para que las próximas sesiones la respeten.

## Comprobaciones previas

- Revisión en solo lectura del 2026-10-07: Libros y Fichas implementan cada uno inicio de sesión, perfil, amistades, bloqueos, chat con gateway propio, notificaciones, moderación y normas. Nodaria tiene cuentas y un tablón de peticiones y errores con plugin de Notificapp. Lorcana y Poke-Voice tienen cuentas con Firebase Auth. El inventario completo está en `docs/agentes/CONTEXTO_PROYECTO.md` de la plataforma.
- Los frontends de Libros y Fichas viven en el PC del propietario. Él les entregará esta misma petición.

## Calendario y dependencias

Sin fecha. La congelación dura hasta que termine la migración de cada web. No hay que preparar nada todavía.

Respuesta esperada: añadid la resolución en este documento, indicando si la aceptáis y dónde queda anotada la congelación, y movedlo a `docs/peticiones/respondidas/` con su prefijo de estado. Si algún punto choca con trabajo en curso, explicadlo en la resolución y lo resolvemos antes.

## Fuera de alcance

- No se pide integrar, migrar ni cambiar código ahora.
- No afecta a las funciones propias de cada web (catálogo, colección, fichas, campañas, mapas, mazos, juego…).
- Notificapp y Yosiftadísticas siguen igual; la plataforma se coordinará con ellos por separado.

## Resolución

<!-- La rellena el destinatario. Ver docs/peticiones/README.md. -->
