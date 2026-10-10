# Petición a las webs con cuentas: aclarar la congelación de peticiones y errores

Fecha: 2026-10-09
Solicitante: plataforma común de Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`)
Destinatarios: Libros (API y frontend), Fichas (API y frontend), Nodaria, Lorcana y Poke-Voice
Afecta a: las peticiones de usuarios, los reportes de errores y las propuestas de mejora (tablones, formularios y plugins de Notificapp).

## Contexto

La petición del 2026-10-07 (`congelar-cuentas-y-social-hasta-la-migracion.md`) congeló, entre otras áreas, «peticiones y errores de usuarios». El 2026-10-08 el propietario acotó lo que la plataforma se queda de esa área:

- **Lo que pasa a la plataforma:** los **errores** y las **propuestas de mejora o de funcionalidades nuevas** de todas las webs. Hay un formulario común que cada web abre con el SDK (`<yosi-reportar>` o `yosiftware.reportar()`), seguimiento y un listado público en `social.yosiftware.es`. Guía: `docs/publica/ERRORES_Y_PROPUESTAS.md` de la plataforma y `ecosistema-kit/ACCESO.md`, «Errores y propuestas».
- **Lo que se queda en cada web:** sus **peticiones propias**, las que necesitan sus campos y su flujo (por ejemplo, pedir que se añada un libro, una ficha o un contenido). Siguen en cada web, con su propio plugin de Notificapp, y cada web las gestiona a su manera.

## Qué necesitamos

1. **Vuestras peticiones propias ya no están congeladas.** Podéis mantenerlas y mejorarlas, con su plugin de Notificapp, sin esperar a la migración.
2. **Los errores y las propuestas de mejora sí siguen congelados** hasta vuestra migración: no añadáis funciones nuevas en esa parte. Fichas y Nodaria conservan sus tablones de errores e ideas tal como están; en su migración, pasarán a la plataforma con su historial, según su guía.
3. Si en una misma pantalla conviven las peticiones propias con los errores o las ideas (como el tablón de Nodaria), no hace falta separarlas ahora: se hará en la migración.
4. Anotad esta aclaración en vuestro contexto vivo junto a la congelación anterior.

## Comprobaciones previas

- Revisión en solo lectura del 2026-10-09 de `Fichas API/docs/api/usuarios_feedback.md` (bugs y peticiones de funcionalidad, con sus adjuntos y su cola admin) y de `nodaria/docs/backend/README.md` (peticiones `idea` y `error` con votos): la plataforma cubre los dos casos (tipo, seguimiento, votos y capturas), y su guía de migración explicará cómo pasar el historial.

## Calendario y dependencias

Sin fecha: vale desde ahora y hasta la migración de cada web. No hay que preparar nada.

## Fuera de alcance

- No se pide integrar el formulario de la plataforma todavía: llega con la migración de cada web.
- Las comunidades, el chat y las notificaciones siguen como en la petición anterior.

## Resolución

<!-- La rellena el destinatario. Ver docs/peticiones/README.md. -->
