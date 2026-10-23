# Comunidad: proyectos públicos y novedades de quien sigues

Fecha: 2026-10-19 (planificado); implementado el 2026-10-23. Estado: **fases 0 a 4 implementadas**; falta lo que hace el propietario (instalar el plugin de Notificapp, publicar las normas y probarlo con sus cuentas) y lo anotado en «Pendiente». Es el roadmap activo principal desde el 2026-10-23 (el del calendario está implementado y a la espera de su piloto).

## Objetivo

Que Nodaria tenga comunidad:

- Cada persona puede declarar **público** un proyecto suyo, siempre **de solo lectura**: nadie más lo edita.
- La gente se **sigue** entre sí y recibe las **actualizaciones** de los proyectos de quienes sigue.

## Qué es de la plataforma y qué es de Nodaria

Según el kit (`ecosistema-kit/SOCIAL.md`, `NOVEDADES.md` y `MODERACION.md`), buena parte ya existe en la plataforma y Nodaria **no la construye por su cuenta**:

| Pieza | De quién | Cómo |
| --- | --- | --- |
| Seguir, amistades, bloqueos y búsqueda de personas | Plataforma | Rutas `/v1/personas…` y `/v1/social/…` con el token de la plataforma. Nodaria no tiene seguidores propios. |
| Feed de actualizaciones, «me gusta» y comentarios | Plataforma | **Novedades**: el backend de Nodaria las publica con su credencial de servicio; el frontend lee `GET /v1/novedades` y `/descubrir` (solo las de Nodaria). |
| Denunciar personas, novedades y comentarios; sanciones | Plataforma | `yosiftware.denunciar(…)` del SDK; la sanción vale en todas las webs. |
| El proyecto público: qué se publica, la página de solo lectura, la lista de públicos de cada persona | **Nodaria** | API y frontend propios. |
| Denunciar un proyecto público y moderarlo | **Nodaria** | Sus denuncias, su cola y su plugin de Notificapp (`nodaria-api`). Avisos a la cuenta: `POST /v1/servicio/moderacion/incidentes`. |
| Normas propias de la web | Nodaria las redacta; el propietario las publica | Borrador en [`docs/normas/NORMAS_NODARIA.md`](../normas/NORMAS_NODARIA.md), para `Webs registradas › Nodaria › Normas`. |

## Decisiones

Las cinco preguntas abiertas se resolvieron el 2026-10-23 con la opción recomendada, sin esperar al propietario (como pidió al empezar el roadmap del calendario); todas son revisables:

1. **Publicar es una copia, no el proyecto vivo**: «Publicar» sube una instantánea y «Publicar los cambios» la sustituye. Lo que se edita a medias no sale.
2. **Copiar**: quien publica decide con «Dejar que otras personas hagan una copia para ellas» (desmarcado por defecto). La copia es un proyecto propio e independiente, con un id nuevo y el nombre «(copia)». No guarda la autoría: no hay campo para ello en el modelo.
3. **La página pública se ve sin sesión**, con el enlace. Sin sesión no se ve quién la publicó (los perfiles de la plataforma solo se ven con sesión) ni se puede seguir ni denunciar.
4. **Las notas de las fichas salen fuera por defecto**; se pueden incluir. Las imágenes salen por defecto y se pueden quitar. Se pueden dejar fuera tipos enteros (con sus subtipos): sus nodos desaparecen como al borrarlos. **Nunca salen** la agenda, las conversaciones con la IA ni los comentarios del grupo.
5. **Solo los proyectos propios**: los de un grupo, de momento no (409 `proyecto_de_grupo`; la interfaz propone duplicarlo).

Además:

- **Solo lectura, sin excepciones**: la API no tiene ninguna ruta que escriba en un público ajeno; la página pública monta el proyecto en memoria con un filtro que solo deja cambiar cómo se mira (disposición, filtros, vistas guardadas) y esconde los controles de edición (los mismos que ahora esconde el rol de lector de un grupo).
- **Novedades**: `proyecto.publicado` («ha publicado en Nodaria el proyecto «X», con N nodos y M relaciones») y `proyecto.actualizado` (una al día como mucho, `proyecto-<id>-<AAAA-MM-DD>`; si es el mismo día de la publicación, se corrige la de publicar). Se retiran todas al dejar de publicar, al retirarlo por moderación o al borrar el proyecto. Salen de una cola del backend después de confirmar la transacción, con reintentos. Sin imagen de momento.
- **Quién puede publicar**: la persona dueña, con el proyecto ya sincronizado en su cuenta (la interfaz sincroniza antes). Con `creacion`, `publicacion` o `comunidad` limitadas, no; con normas pendientes, tampoco.
- **Retirado por moderación**: deja de verse y no se puede actualizar; la persona lo ve en «Publicar…» con el motivo y puede dejar de publicarlo (lo borra).
- **Dónde se ve en Nodaria**: «Comunidad» en el menú de la cuenta y en la paleta (Ctrl+K), con «De quienes sigues», «Descubrir» (los públicos recientes de Nodaria y las novedades de la plataforma) y «Tus publicados», y el perfil de cada persona con sus públicos, sus novedades, «Seguir» y «Denunciar». «Publicar…» en el engranaje del proyecto.

## Fases

### Fase 0 — Preparación con la plataforma

- [x] Rutas de novedades, personas, relaciones y moderación comprobadas en `docs/publica/ENDPOINTS.md` de la plataforma. La credencial de servicio de Nodaria ya publica las novedades de Yosiftware.
- [x] Normas propias redactadas: [`docs/normas/NORMAS_NODARIA.md`](../normas/NORMAS_NODARIA.md). **Las publica el propietario.**
- [x] `LISTA_DE_COMPROBACION.md` revisada (ver «Lista de comprobación»).

### Fase 1 — Publicar un proyecto (API)

- [x] Migración `0012_public_projects`: `public_projects`, `public_news`, `public_reports` y `outbox`.
- [x] Rutas: `GET`/`PUT`/`DELETE /api/projects/{id}/publicacion`, `GET /api/publicaciones`, `GET /api/publicos` y `/api/publicos/{id}` sin sesión, `POST /api/publicos/{id}/denuncias`. Contrato en `docs/backend/README.md`, «Proyectos públicos».
- [x] Reglas: solo lo propio y sincronizado; restricciones y normas; tamaño como la sincronización; nada de escritura sobre lo publicado.
- [x] Pruebas de la API (11 nuevas), con el contrato del almacén también contra SQL Server.
- [ ] Imagen del mapa para la novedad y la vista previa (pendiente).

### Fase 2 — Página pública de solo lectura (frontend)

- [x] `/p/<id>` (`src/components/community/PublicApp.tsx`, elegido en `main.tsx`): mapa, Tabla, Cronología y fichas en solo lectura, con `<yosi-webs>` y `<yosi-acceso>` en la cabecera. No abre los proyectos del navegador de quien mira.
- [x] «Publicar…» en el engranaje (`PublishDialog`): descripción, qué sale, resumen, enlace, «Publicar los cambios» y «Dejar de publicar». Dominio en `src/domain/publication.ts`.
- [x] El script de Yosiftadísticas va en la página pública (la sirve el mismo `index.html`).
- [ ] Metadatos para compartir el enlace (título, descripción e imagen en la vista previa de otras webs): Firebase Hosting solo sirve archivos, así que necesitarían que otra pieza genere el HTML de cada público. El título de la pestaña sí cambia.

### Fase 3 — Novedades y seguimientos

- [x] Catálogo al arrancar la API y cola de publicación con reintentos (idempotente por `idExterno`).
- [x] Publicar al publicar, al actualizar (una al día) y retirar al despublicar, retirar o borrar.
- [x] «Comunidad»: «De quienes sigues», «Descubrir», «Tus publicados» y el perfil con sus públicos, sus novedades y «Seguir», con «me gusta» y comentarios de la plataforma.
- [x] Bloqueos (un 404 es «no hay nadie»: no se enseña ni la persona ni lo suyo) y perfiles privados (`@alias`; «solo sus amistades ven sus novedades»).

### Fase 4 — Moderación y privacidad

- [x] «Denunciar» a la vista en la página pública (denuncia propia de Nodaria), en cada novedad y comentario y en el perfil (`yosiftware.denunciar`, con `persona`).
- [x] Plugin `nodaria-api` 2.0.0 (`notificapp-plugin/`): aviso `nodaria_report` por denuncia, retirar (con aviso opcional a la cuenta en la escalera de la plataforma) o desestimar. **Lo instala el propietario** (cambia los permisos: `eventKinds` y `api`).
- [x] Política de privacidad: «Proyectos públicos y comunidad» y dos filas en la tabla (23 de octubre de 2026).

**Termina cuando:** una persona publica un proyecto, otra que la sigue ve la novedad en Nodaria y en la web social, abre la página pública sin poder editar nada, la actualización llega como novedad, despublicar lo retira todo y una denuncia llega a Notificapp y se resuelve. Lint, build, pruebas de front y API, Edge en producción y la lista de comprobación del kit cumplida.

## Verificación (2026-10-23)

- Lint, build, 409 pruebas del front (4 nuevas de `publication.ts` y 1 de los modelos de la IA) y 81 de la API (11 nuevas), con el contrato del almacén también contra SQL Server.
- Edge sin interfaz con la API real (rutas y reglas, almacenes en memoria y tokens de prueba firmados) y el SDK y la plataforma simulados: 34 comprobaciones del flujo entero (publicar con las notas fuera, novedad encolada con su enlace, página sin sesión con mapa, ficha, Tabla y Cronología sin controles de edición y sin abrir los proyectos del navegador, autor y «Seguir» con sesión, denuncia con su aviso para Notificapp, «Hacer una copia», «Publicar los cambios», «Comunidad» con «me gusta», «Tus publicados» y «Descubrir», «Dejar de publicar» y su retirada, y 390 px). La única consola con errores es el 404 esperado al abrir el enlace ya despublicado.

## Lista de comprobación (lo que añade tener contenido público)

- Zona social con «Denunciar» a la vista: página pública, novedades, comentarios y perfiles. Hecho.
- Cola de moderación propia en Notificapp, a nombre de la web: plugin `nodaria-api` 2.0.0. Falta instalarlo.
- Normas propias: redactadas; falta publicarlas. La API ya rechaza con `normasPendientes`.
- Novedades desde el backend, en segundo plano y tras la transacción; `publicada: false` sin reintentos; el navegador nunca publica. Hecho.
- Nunca se revela un bloqueo y se esconde a las dos personas entre sí en lo de Nodaria (perfil, sus públicos y sus novedades). Hecho; la lista de «Descubrir» de Nodaria no conoce los bloqueos (es pública como el enlace) y no enseña nombres.
- CSP: la página pública usa los mismos orígenes que la web. Yosiftadísticas, el mismo script.

## Pendiente

- Hecho el 2026-10-23: plugin instalado con su credencial externa, credencial de emisor copiada a la API y normas publicadas (versión 1). Falta el piloto con dos cuentas (publicar, seguir, ver la novedad en Nodaria y en la web social, denunciar y resolver desde Notificapp).
- Lo de la segunda tanda (abajo) está hecho; queda probarlo con cuentas reales, sobre todo los chats y las amistades.

## Segunda tanda (2026-10-23, formato 11)

Pedido del propietario: «Comunidad» era un modal escondido en el menú de la cuenta; quiere un botón a la vista, los chats, buscar personas, seguirlas o hacerse amistades y un feed completo, todo en vistas, y que se hagan los pendientes. Lo dejó a mi criterio, para revisarlo después.

- **Botón «Comunidad» en la barra** (`CommunityButton`), junto a las vistas, con el número de mensajes sin leer y de solicitudes de amistad (`CommunityPendingProvider`, en `src/state/communityPending.tsx`: pregunta cada minuto y al volver a la pestaña a `GET /v1/chat/conversaciones` y `GET /v1/social/resumen`, y nunca enseña lo de otra cuenta). Si ya se está en Comunidad, vuelve a la vista del proyecto. También desde el menú de la cuenta y la paleta.
- **Comunidad es una vista** (`View = 'community'`, `CommunityView`), a pantalla completa y fuera de las del proyecto (sin el asistente ni el chat del grupo al lado), con su menú (`navigation.community`: pestaña, persona y conversación; `projectView` recuerda adónde volver). La dirección la sigue (`#comunidad/inicio`, `#comunidad/persona/<id>`, `#comunidad/chats/<id>`, `communityHash.ts`): se puede recargar y enlazar, y la página pública enlaza así al perfil de quien la publicó. Se monta de nuevo con cada cuenta. Por debajo de 900 px el menú pasa a una fila de iconos.
- **Inicio**: el feed completo de las novedades de Nodaria de tus amistades y seguidos, que carga más al llegar al final; con su imagen, «me gusta», comentarios y «Denunciar».
- **Descubrir**: los proyectos públicos recientes con su imagen y un buscador; con sesión, las novedades para descubrir.
- **Personas**: buscar por alias o nombre (`GET /v1/personas`), y las solicitudes (recibidas, con aceptar o rechazar; enviadas, con retirar), amistades, seguidos, seguidores y bloqueos. Cada persona lleva sus acciones (`RelationActions`): seguir, pedir, aceptar o dejar la amistad, «Mensaje» (solo entre amistades: `POST /v1/chat/conversaciones/directa` y abre Chats), bloquear y denunciar. Todo con las rutas de la plataforma; Nodaria no guarda nada.
- **Perfil** de una persona: su perfil de Yosiftware, sus acciones, sus proyectos públicos y sus novedades. Un 404 (no existe, está suspendida o hay un bloqueo) no enseña nada suyo.
- **Chats**: la bandeja y la conversación del SDK incrustadas (`<yosi-chat-bandeja>`, `<yosi-chat-conversacion>`), con la paleta de Nodaria; en el móvil, una cosa cada vez con «volver».
- **Tus publicados**: con su imagen, el enlace, el enlace con vista previa y «Abrir el proyecto».
- **Imagen del mapa** (`mapThumbnail.ts`): al publicar, el navegador dibuja un PNG de 1200 × 630 con la disposición por fuerzas (respetando lo fijado a mano), los colores de los tipos, los vínculos y, hasta 25 nodos, los nombres. La API la guarda (`0013_public_project_extras`, `image`), la sirve en `GET /api/publicos/<id>/imagen?v=<versión>` y la pone en la novedad (`imagen`), en las tarjetas y en la vista previa. Publicar los cambios la renueva; si el navegador no la dibuja, se publica sin ella y se conserva la anterior. La CSP de la web admite las imágenes de la API.
- **Enlace con vista previa**: `https://nodaria-api.yosiftware.es/compartir/<id>` sirve una página mínima con los metadatos Open Graph (título, descripción e imagen) que lleva a la página pública. Hace falta porque Firebase Hosting solo sirve archivos. En «Publicar…» y «Tus publicados», «Copiar el enlace con vista previa».
- **Proyectos de grupo**: los publica la propiedad del grupo (403 `solo_la_propiedad` a los demás miembros, a los que el diálogo se lo explica). La API comprueba el proyecto del grupo y guarda de qué grupo es (`group_id`, que no se enseña fuera).
- **Autoría en las copias**: «Hacer una copia» guarda el original (`Project.origin`: id público, nombre, cuenta y fecha; formato 11). El engranaje lo recuerda («Copia de «X»», que abre el original) y, si la copia se publica, su página dice «Basado en «X»» con el enlace (la API guarda `origin`).

**Verificado:** lint, build, 425 pruebas del front (4 nuevas: direcciones, miniatura y origen) y 98 de la API (imagen, vista previa, origen y grupo; el contrato del almacén también contra SQL Server). Edge con la API real en memoria y la plataforma simulada: 23 comprobaciones (publicar con imagen y su enlace con vista previa, la imagen en la novedad y servida por la API, el botón con su contador, la vista a pantalla completa y su dirección, el feed, Descubrir con imagen, aceptar y pedir amistades, buscar, el perfil, «Mensaje» que abre la directa en Chats, recargar sin perder el sitio, volver al proyecto y 390 px). Los elementos del chat no se pintan sin el SDK real: los chats quedan por probar con cuentas reales.

## Ventana de chats flotante (2026-10-23)

Pedido del propietario: una ventana de chats como la de Fichas. Tiene que poder moverse libremente por toda la web, cerrarse o minimizarse, con los chats como burbujas, y reunir los chats individuales, los de los grupos de trabajo y los que lleguen en el futuro.

- **Decisión: la ventana del SDK, `<yosi-chat>`** (`ecosistema-kit/CHAT.md`), en lugar de una propia. Da lo pedido sin código de Nodaria y es la misma que se aceptó para Fichas en su petición a la plataforma:
  - un botón con lo no leído;
  - el listado (directas, grupos, las conversaciones de los grupos de trabajo, que son espacios, y las de las demás webs);
  - hasta cinco conversaciones en ventanas que se arrastran por toda la página, cambian de tamaño y se minimizan a burbujas con su contador;
  - el botón y las burbujas se arrastran y se pegan al lado más cercano;
  - en el móvil, una vista a pantalla completa.

  La plataforma guarda en la cuenta, para esta web, cómo la deja la persona. Nodaria no guarda nada. Lo único que no trae es minimizar la ventana a una barra con título (Fichas la minimiza a burbuja). **(revisable)** Si se quiere ese aspecto, se puede pedir a la plataforma o hacer una carcasa propia, como la de Fichas en el escritorio.
- **En Nodaria** (`FloatingChat.tsx`):
  - Se monta en toda la web (`App.tsx`) con los colores del tema y se vuelve a montar con cada cuenta (`CAMBIO_DE_CUENTA.md`). Sin sesión no enseña nada.
  - «Escribir» en el perfil de una persona abre su conversación en la ventana. Si la ventana está apagada, se abre la pestaña «Chats».
  - El panel del grupo del proyecto tiene «Abrir en una ventana».
  - Se puede apagar en este navegador: la casilla de «Chats» o «Ocultar la ventana de chats» en la paleta (preferencia `floatingChat`, encendida por defecto).
  - La pestaña «Chats» y el panel del grupo siguen igual.
- **Verificación:**
  - Edge (`check-chat.cjs`): montada, con los colores de Nodaria, se oculta desde la paleta y sigue oculta al recargar, y se vuelve a mostrar; sin errores.
  - En producción, además, el SDK real la define.
  - Falta que el propietario la pruebe con su cuenta: arrastrar, minimizar a burbuja, varias conversaciones y la del grupo.
