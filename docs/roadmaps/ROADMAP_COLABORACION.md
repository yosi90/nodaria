# Roadmap por hitos: grupos de trabajo y colaboración

Fecha: 2026-10-13.
Estado: **roadmap activo principal desde el 2026-10-17**: el propietario levanta para Nodaria la congelación del ecosistema y pide empezar a implementar. Hitos 1 y 2 hechos y publicados el 2026-10-17: API (`c0f8e01`) y frontend (ver «Contrato del hito 1» y «Frontend de los hitos 1 y 2»). El propietario decide saltarse las maquetas y el ensayo en QA: lo prueba en producción con su cuenta de empresa y los fallos se arreglan cuando salgan. Hito 3 hecho el 2026-10-17 (ver «Tiempo real y combinación (hito 3)»), salvo un indicador de «sin conexión» propio de los compartidos. Hito 4 hecho el 2026-10-17 (chat del grupo), salvo comprobar con cuentas reales el correo de las invitaciones. Siguiente: hito 5 (revisión y usos especializados), si el propietario lo decide. La migración de Nodaria a la plataforma terminó el 2026-10-15, y la plataforma respondió la petición de coordinación con los espacios el 2026-10-17 (ver «Puesta al día del 2026-10-17»).

## Puesta al día del 2026-10-17: los espacios de la plataforma

Redactada por la plataforma a petición del propietario (fase 9 de su roadmap de los espacios), sin tocar el código de Nodaria. Nodaria la revisa al activar este roadmap. La plataforma respondió la petición de coordinación con los **espacios** (kit 1.38: `ecosistema-kit/ESPACIOS.md`; guía `docs/publica/ESPACIOS.md` de la plataforma). Cambia el reparto: **la pertenencia del grupo de trabajo es de la plataforma**, y el tablero, sus operaciones y sus conflictos siguen en Nodaria. Lo que este documento dice más abajo sobre grupos, invitaciones, correo y transporte se lee con esta tabla, que manda sobre él:

| Pieza | Antes (2026-10-13) | Ahora |
| --- | --- | --- |
| Grupo de trabajo, miembros, roles y propietario | Nodaria | **Plataforma**: un espacio por grupo. Nodaria declara sus roles (`PUT /v1/servicio/espacios/roles`) y crea el espacio a nombre de quien lo pide; se entera de los miembros por el feed (`espacio.*`, `miembro.*`) y autoriza el tablero en local, solo a los miembros `activo` |
| Capacidades | Nodaria | La plataforma aplica tres por rol: gestionar miembros, invitar y el chat (escribir, leer o nada). Leer o editar el tablero, cambiar el esquema y comentar siguen siendo de Nodaria, por rol |
| Propietario único y traspaso | Nodaria | **Plataforma**: la propiedad es una cuenta, lo puede todo y solo se cede con un traspaso aceptado. `propietario` no es un rol que se declare |
| Invitaciones (persona o correo), caducidad, revocación, reenvíos | Nodaria, con ayuda de la plataforma | **Plataforma**, también el correo (`noreply@yosiftware.es`). Nunca revela si un correo tiene cuenta; para aceptar, la cuenta tiene que tener ese correo confirmado. Se aceptan dentro de Nodaria, con el SDK (su ventana o una interfaz propia con `data-invitaciones="propias"`) |
| Aviso a quien nunca entró en Nodaria | Por acordar | **Resuelto**: la notificación de la invitación la emite la plataforma |
| Transporte de los cambios del tablero y presencia | Por acordar | **Canal del espacio**: la API de Nodaria publica lo confirmado (`POST /v1/servicio/espacios/{idExterno}/canal`, hasta 16 KB, con `idExterno` idempotente) y el frontend lo recibe con `yosiftware.espacios.canal()`, en orden, con recuperación al reconectar y la presencia. Lo perdido más de 24 horas (o más allá de los últimos 1000) llega como `desfase`: recargar la instantánea |
| Chat del grupo | `PUT /v1/servicio/chat/conversaciones/{idExterno}` con la lista de miembros | `PUT /v1/servicio/espacios/{idExterno}/conversacion`: los participantes los pone la plataforma según el permiso de chat de cada rol. Ya no hay que mandar la lista ni reconciliar `ignoradas` |
| Solo lectura en el chat | Hueco del contrato | **Resuelto**: `chat: "leer"` por rol |
| Grupos sin cuenta | Aplazado | Sigue aplazado: los espacios son de cuentas |

Proyección propuesta de los roles de este documento sobre los espacios (la decide el propietario al activar el hito 1):

| Rol de Nodaria | `gestionar` | `invitar` | `chat` |
| --- | --- | --- | --- |
| Propietario | La propiedad del espacio (no se declara) | | |
| Responsable | Sí | Sí | `escribir` |
| Editor | No | No | `escribir` |
| Revisor (hito 5) | No | No | `escribir` |
| Lector | No | No | `escribir` (la recomendación de este documento: leer el tablero no impide conversar) |

Consecuencias en los hitos:
- **Hito 0**: la petición de coordinación queda resuelta por la plataforma; sus decisiones están en `docs/publica/ESPACIOS.md`. La migración de Nodaria terminó el 2026-10-15.
- **Hitos 1 y 2**: el modelo de Nodaria guarda la copia del feed (grupos y miembros) y sus proyectos compartidos, no invitaciones ni propiedad. Invitar, aceptar, rechazar, salir, cambiar rol y traspasar van por la plataforma (`/v1/espacios`, con el token de la plataforma).
- **Hito 3**: el transporte es el canal del espacio; la secuencia, la idempotencia y la autorización de las operaciones siguen en la API de Nodaria.
- **Hito 4**: el chat del grupo es la conversación del espacio, y el correo y el aviso los da la plataforma. Queda incrustar la conversación y las notificaciones propias de Nodaria.

En QA, la plataforma solo envía correos a su propio buzón: una invitación a un correo aparece en las pendientes de la cuenta que lo tiene confirmado, pero el correo no llega. La web de pruebas de la plataforma lo usa de punta a punta (`webs/pruebas/api/espacios.mjs` y `webs/pruebas/src/main.ts`), por si sirve de ejemplo.

## Revisión de Nodaria (2026-10-17)

Contrastada la puesta al día con `ecosistema-kit/ESPACIOS.md` (kit 1.38) y `docs/publica/ESPACIOS.md` de la plataforma: el reparto, las rutas, los límites y la proyección de roles son correctos. Lo que no recoge y hay que tener en cuenta al activar los hitos, con las decisiones del propietario del 2026-10-17. Ninguna necesita cambios en la plataforma, así que no se le envía petición:

1. **Rol por defecto: Lector** (decidido). El catálogo exige uno, y solo uno, con `porDefecto` (lo recibe quien entra sin rol elegido, también una invitación sin `rol`).
2. **`gestionar` incluye los ajustes del espacio: se acepta** (decidido; manda la plataforma). Un responsable puede cambiar `entrada` (a `solicitud` o `abierto`) y `dosPasos` con `PATCH /v1/espacios/{id}`, también desde fuera de Nodaria; la API se limita a poner al día su copia con `espacio.cambiado`. Cuadra con «el responsable no modifica al propietario»: dar o quitar un rol que gestiona solo lo hace quien tiene la propiedad.
3. **El proyecto de un grupo es del grupo, no de una cuenta** (decidido).
   - **Al borrarse una cuenta**, el proyecto del grupo no se borra. La plataforma ya pasa el espacio a quien más tiempo lleve gestionándolo (o al miembro activo más antiguo), y Nodaria lo sigue con `espacio.cambiado`. Hoy el feed de Nodaria borra el usuario y sus proyectos con `cuenta.estado: borrada` (`api/src/platform/feed.ts`): en el hito 1, los proyectos compartidos se guardan a nombre del grupo, no del usuario, y ese borrado no los toca. Si la plataforma borra el espacio porque no queda nadie, no hay a quién darlo y el proyecto se borra.
   - **Al borrar el grupo**, quien lo borra elige quién se queda el proyecto (él mismo u otro miembro activo), que pasa a ser un proyecto propio de esa cuenta; si no es él, se le avisa. Solo puede hacerlo el administrador del grupo: quien tiene la propiedad, como dice la tabla de capacidades. La plataforma lo permite sin cambios: un espacio solo lo borra el backend de su web (`DELETE /v1/servicio/espacios/{idExterno}`; la persona no tiene ruta para borrarlo), así que la API de Nodaria confirma la elección y el traspaso del proyecto en su base y después borra el espacio, con reintento idempotente.
4. **El feed descarta lo desconocido.** `createSqlFeedStore` ignora todo lo que no sea `cuenta.estado` y avanza el cursor. Tratar `espacio.*` y `miembro.*` tiene que llegar en la misma entrega que declare los roles o cree el primer espacio; si no, esos cambios se pierden y hay que resincronizar con `GET /v1/servicio/espacios/{idExterno}/miembros`.
5. **El canal admite 16 KB.** Las imágenes de los atributos (data URL de hasta 384 px), la imagen del mapa (hasta 2400 px) y las operaciones grandes no caben: el canal lleva la operación pequeña o una referencia con la revisión, y el frontend pide el resto a la API.
6. **Presencia por espacio, no por proyecto.** Con un proyecto por grupo equivalen, si el frontend abre el canal solo con el tablero abierto. Con varios proyectos por grupo (hito 5) habrá que distinguirlos en `datos`.
7. **Verificación en dos pasos** (aceptado). `dosPasos` es opcional (por defecto `false`); un miembro `sin_dos_pasos` está en pausa y no tiene acceso. Nodaria solo autoriza a los `activo`.
8. **Clave de IA del grupo, solo en sus proyectos** (decidido). La API de Nodaria envía `X-Yosi-Espacio` en el asistente de IA (`ROADMAP_IA.md`) solo cuando el proyecto es del grupo, o es otro proyecto compartido que el administrador del grupo ha marcado como válido para usar su clave. En el resto, la clave de la persona. La plataforma ya exige que la cuenta sea miembro activo y aplica los proveedores y modelos que permite el grupo; qué proyecto la usa lo decide Nodaria, así que no hace falta pedirle nada. Con `409 sin_clave_de_ia` para el grupo, no se pasa a la clave de la persona sin que lo sepa.
9. **Kit y SDK.** El kit local es el 1.32: copiar el 1.38 al activar. El SDK 1.17 ya se sirve en `sdk/v1`: sin espacios no cambia nada en Nodaria. La CSP ya admite el gateway (`src/services/csp.ts`, `connect-src`).
10. **Secciones que quedan obsoletas** y se reescriben al activar: «Reparto de responsabilidades», «Huecos de integración», «Invitaciones» (secreto, huella, estados y entregas son de la plataforma) y, en el hito 4, poner al día los miembros del chat y reconciliar `ignoradas`.

## Objetivo

Compartir proyectos de Nodaria entre varias personas, con pertenencia a grupos, permisos claros, invitaciones y cambios visibles mientras trabajan en el mismo tablero. Reutilizar la cuenta, el chat y las notificaciones del ecosistema.

El producto sigue siendo generalista: escritura, empresa, investigación, desarrollo, eventos, grupos de rol y clubes de lectura son usos y vocabularios, no dominios obligatorios del núcleo.

## Requisitos y alcance

| Propuesta del propietario                  | Tratamiento previsto                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Crear grupos de trabajo                    | Grupos propios de Nodaria, con miembros y proyectos compartidos.                                                                       |
| Ver las modificaciones en tiempo real      | Propagar cambios confirmados por el servidor; proteger las ediciones concurrentes.                                                     |
| Invitar por correo                         | Invitación al grupo/proyecto, con aceptación explícita y cuenta Yosiftware. Necesita coordinación con la plataforma.                   |
| Cuenta existente: aviso interno y correo   | Objetivo de producto sujeto a las preferencias y bloqueos centrales; hoy el aviso de una web solo llega a quien ya ha entrado en ella. |
| Sin cuenta: correo y alta antes de aceptar | Mantener la invitación pendiente durante el alta y verificar el destinatario al aceptar.                                               |
| Chat del grupo                             | Conversación de comunidad servida por la plataforma y vinculada a la pertenencia en Nodaria.                                           |
| Usar grupos sin crear cuenta               | Ampliación opcional, aplazada. Mantener el uso local individual y el intercambio de archivos.                                          |
| Lectura y escritura                        | Permisos comprobados por la API para el tablero compartido; límites explícitos para copias locales.                                    |
| Nombres de rol según proyecto              | Etiquetas de presentación sobre permisos estables y visibles.                                                                          |

**Aclaración del propietario, 2026-10-13:** «offline» significa dar soporte a grupos u organizaciones que quieran usar Nodaria sin crear cuentas. No exige trabajar desconectados físicamente. Acepta obviar esa modalidad si complica demasiado la iniciativa. La recomendación de este roadmap es aplazarla; no se considera una exigencia del primer lanzamiento.

Fuera de la primera entrega: invitados anónimos al tablero del servidor, edición colaborativa de texto carácter a carácter, mensajes directos propios, archivos adjuntos del chat, permisos por nodo/atributo, proyectos públicos y una organización que abarque varias webs. No se modifica ahora el acceso ni se anticipa la migración.

## Evidencia y viabilidad

Revisión local en solo lectura del 2026-10-13:

- `src/services/sync.ts` y `src/state/sync.tsx`: sincronización de documentos completos, con elección por `updatedAt` si ambos lados cambian; no combina las dos ediciones.
- `api/src/routes/projects.ts` y `api/migrations/0002_projects.sql`: proyecto identificado por `(user_id, project_id)`, escrituras con `baseVersion` y respuesta 409 en conflicto. El modelo actual representa copias de una cuenta, no un recurso compartido con miembros.
- `src/state/history.ts`: deshacer restaura instantáneas del estado completo. Excluir lo remoto del historial no basta para evitar que un deshacer posterior reponga una instantánea anterior a los cambios de otra persona.
- `docs/codex/PROJECT_CONTEXT.md`: IndexedDB es la copia local de trabajo; ya existen importación/exportación JSON y backend Fastify + SQL Server. No hace falta trasladar los mapas a la base central ni cambiar toda la pila.
- Plataforma en `C:/Users/Yosi/Desktop/administracion yosiftware`: `docs/agentes/CONTEXTO_PROYECTO.md`, `docs/publica/CHAT.md`, `NOTIFICACIONES.md`, `ENDPOINTS.md`, `openapi.json`, y `ecosistema-kit/CHAT.md` y `FEED_DE_CAMBIOS.md`.
- Según el contexto de la plataforma, los ensayos con Poke-Voice y Lorcana están terminados y su roadmap activo es la migración de Fichas. Esto no equivale a que Nodaria esté migrada; aquí sigue pendiente su guía y ejecución propias.

**Valoración:** viable, con complejidad media para grupos y permisos y alta para concurrencia sin pérdida de datos. Añadir un socket al guardado actual no resuelve el problema. El transporte de eventos y la resolución de conflictos son piezas diferentes.

No se han probado servicios ni escrituras en producción para este análisis. Las disponibilidades de la plataforma se toman de sus documentos y del contrato local, no de una prueba de integración de Nodaria.

## Reparto de responsabilidades

Reescrito el 2026-10-17 con los espacios (kit 1.38, `ecosistema-kit/ESPACIOS.md`).

| Pieza | Responsable | Cómo |
| --- | --- | --- |
| Cuenta, alta, sesión, perfil, identidad global | Plataforma | Integrado desde el 2026-10-15. |
| Grupo, miembros, roles, propiedad y traspaso | Plataforma (un espacio por grupo) | La API de Nodaria declara los roles, crea el espacio a nombre de quien lo pide y lo borra; guarda una copia del feed y autoriza con ella. |
| Invitaciones (persona o correo), su correo y su aviso, solicitudes, salir | Plataforma | La persona lo hace desde Nodaria con el SDK (`yosiftware.espacios` y su ventana) y el token de la plataforma. Nodaria no guarda invitaciones ni envía correos. |
| Qué puede hacer cada rol con el proyecto | API de Nodaria | `capabilitiesOf` (`api/src/groups/model.ts`): leer, editar, cambiar el esquema y borrar el grupo. |
| Proyecto compartido, revisiones y conflictos | API de Nodaria | `dbo.group_projects`: una versión en el servidor; escribir exige la versión vigente. |
| Transporte de los cambios y presencia | Plataforma (canal del espacio); contenido de Nodaria | Hito 3: la API publica lo confirmado y el frontend lo recibe con `yosiftware.espacios.canal()`. |
| Chat del grupo | Plataforma (conversación del espacio) | Hito 4: la API la pide y el frontend la incrusta; la plataforma pone los participantes según el rol. |
| Notificaciones propias de Nodaria | Plataforma (centro común); emisión desde la API | Hito 4, si hacen falta además de las de la invitación. |
| Clave de IA del grupo | Plataforma (claves de la organización); uso decidido por Nodaria | Solo en los proyectos del grupo o en los que su administrador marque (decisión del 2026-10-17). |

La API de Nodaria sigue alojando sus datos y aplicando sus reglas. No se crea un segundo chat, un segundo sistema de cuentas ni una pertenencia propia: `dbo.group_members` es una copia del feed, nunca la fuente.

Petición de coordinación: [`acordar-invitaciones-y-tiempo-real-para-la-colaboracion-de-nodaria.md`](../peticiones-enviadas/acordar-invitaciones-y-tiempo-real-para-la-colaboracion-de-nodaria.md). Entregada como documento a la carpeta de peticiones de Administración; respondida el 2026-10-17 con los espacios (ver «Puesta al día del 2026-10-17»). No encarga implementar Nodaria ni altera su prioridad de migración.

## Diseño

### Grupo, proyecto y pertenencia

- Distinguir el grupo de trabajo del proyecto y de su conversación. Modelo preparado para varios proyectos, con una primera interfaz de **un proyecto por grupo** para limitar complejidad.
- Primera versión: los miembros del grupo tienen el mismo acceso a ese proyecto. No añadir todavía excepciones por nodo ni mezclar en un mismo chat personas con acceso a distintos proyectos privados.
- Un proyecto compartido tiene una única identidad y una única versión del contenido en el servidor, independientemente de cuántas cuentas lo abran. No duplicarlo por miembro.
- Un único propietario por grupo: la propiedad del espacio, que lleva la plataforma con su traspaso aceptado; el propietario no puede salir sin traspasarlo (`propietario_no_puede_salir`). Responsable de grupo y administrador del ecosistema son conceptos distintos.
- Representar cuentas con el ID global obtenido después de la migración; el correo sirve para entregar una invitación, no como clave de autorización permanente.
- Grupos, miembros y revisiones van fuera del JSON portable (las invitaciones, en la plataforma). Importar un proyecto crea una copia propia, no hereda accesos del servidor.
- Separar «salir del grupo» y «quitar la copia de este navegador» de «eliminar el proyecto compartido». No deducir el borrado del servidor porque falte un proyecto en la lista local.
- El proyecto de un grupo es del grupo (decisión del 2026-10-17): al borrarse una cuenta no se borra, y la plataforma pasa la propiedad a quien más tiempo lleve gestionando el grupo (o al miembro activo más antiguo). Al borrar el grupo, su propietario elige quién se queda el proyecto.

### Roles y capacidades

Primera versión: propietario, responsable, editor y lector. Añadir revisor cuando exista la función de comentarios o sugerencias. Cambiar la etiqueta del rol nunca cambia su capacidad técnica.

| Capacidad                                            | Propietario | Responsable                | Editor          | Revisor (hito 5) | Lector |
| ---------------------------------------------------- | ----------- | -------------------------- | --------------- | ---------------- | ------ |
| Leer el tablero                                      | Sí          | Sí                         | Sí              | Sí               | Sí     |
| Editar nodos, relaciones, notas y posiciones comunes | Sí          | Sí                         | Sí              | No               | No     |
| Cambiar tipos, atributos y restricciones             | Sí          | Sí                         | No inicialmente | No               | No     |
| Comentar y proponer cambios                          | Sí          | Sí                         | Sí              | Sí               | No     |
| Gestionar miembros e invitaciones                    | Sí          | Sí, dentro de su autoridad | No              | No               | No     |
| Transferir propiedad o eliminar el proyecto          | Sí          | No                         | No              | No               | No     |

Las capacidades de comentar/proponer solo existen a partir del hito 5. No presentar al revisor como editor por cambiarle el nombre. El editor incluye borrado de contenido; no incluye borrado del proyecto ni cambios de estructura del esquema. El responsable no puede promoverse a propietario ni modificar al propietario.

Los permisos del chat se deciden por separado y se muestran con claridad. Propuesta inicial: los miembros aceptados pueden conversar, incluido quien solo lee el tablero; no implica escribir en el mapa. Confirmar esta decisión antes del hito 4.

| Tipo de proyecto | Propietario | Responsable                  | Editor                 | Revisor                 | Lector              |
| ---------------- | ----------- | ---------------------------- | ---------------------- | ----------------------- | ------------------- |
| General          | Propietario | Coordinador                  | Colaborador            | Revisor                 | Observador          |
| Empresa          | Propietario | Responsable de equipo        | Colaborador            | Supervisor de revisión  | Observador          |
| Desarrollo       | Propietario | Líder técnico                | Desarrollador          | Revisor de código       | Observador          |
| Escritura        | Titular     | Coordinador editorial        | Escritor               | Corrector               | Lector              |
| Grupo de rol     | Titular     | Director de juego / máster   | Colaborador de campaña | Revisor de ambientación | Espectador          |
| Club de lectura  | Titular     | Coordinador del club         | Colaborador            | Moderador de contenidos | Lector              |
| Investigación    | Titular     | Coordinador de investigación | Investigador           | Revisor                 | Consultor           |
| Eventos          | Titular     | Coordinador                  | Organizador            | Revisor                 | Invitado observador |

Estas son etiquetas sugeridas para **el tablero de Nodaria**: «máster» no concede permisos en Fichas y «moderador» no concede moderación central. Una persona que juega una campaña puede ser lectora aquí. Permitir personalizar las etiquetas y enseñar siempre las capacidades; la categoría de proyecto es opcional y separada de la plantilla de entidades.

### Invitaciones

Reescrito el 2026-10-17: las lleva la plataforma (`ecosistema-kit/ESPACIOS.md`, «Invitar, aceptar y entrar»). Nodaria no guarda invitaciones, secretos ni estados, ni envía correos.

- Invitar (a una cuenta o a un correo, con un rol), ver las pendientes y retirarlas: quien tiene `invitar` (Responsable y la propiedad), desde Nodaria con `yosiftware.espacios.invitar`. Por correo, quien invita nunca sabe si tiene cuenta; caducan a los 14 días.
- Aceptar: solo dentro de Nodaria. El enlace del correo (`#yosi-invitacion=<código>`) y la campana (`#yosi-invitaciones`) llegan a la raíz de Nodaria, donde el SDK abre su ventana. Al aceptar, el frontend llama a `POST /api/grupos/actualizar` para que la API lea el feed y dé acceso sin esperar a la siguiente vuelta.
- Lo que la plataforma ya resuelve: otro correo (`correo_de_otra_cuenta`), los dos pasos, la invitación caducada o retirada, el registro cerrado, los bloqueos, los límites y los reenvíos.
- Primera versión con la ventana del SDK. Si se quiere un diseño propio, `data-invitaciones="propias"` y la interfaz sobre `yosiftware.espacios`, cubriendo esos mismos casos.

### Contrato del hito 1 (API, 2026-10-17)

Implementado en local, sin publicar. Migración `api/migrations/0009_groups.sql`; reglas en `api/src/groups/model.ts`; almacén en `api/src/groups/repository.ts` (SQL y memoria, con el mismo contrato); rutas en `api/src/routes/groups.ts`; cliente de la plataforma en `api/src/platform/spaces.ts`; mantenimiento en `api/src/groups/maintenance.ts`.

- **Datos.** `dbo.groups` (idExterno `grupo-<uuid>`, id del espacio, nombre, propietario, estado `creando`/`activo`/`borrando`/`borrado`), `dbo.group_members` (copia del feed, sin clave ajena a `dbo.users`) y `dbo.group_projects` (el proyecto del grupo: documento, versión, quién lo cambió por última vez; su id es único entre todos los grupos). Ninguno cuelga de una cuenta: borrar una cuenta solo borra sus proyectos propios.
- **Roles declarados** al arrancar la API y hasta que la plataforma los acepte: `responsable` (gestionar, invitar, chat escribir), `editor` (chat escribir) y `lector` (chat escribir, por defecto). La propiedad no es un rol.
- **Capacidades en Nodaria.** Solo miembros `activo`. Propiedad: todo. Responsable: leer, editar y cambiar el esquema. Editor: leer y editar, sin cambiar el esquema (la API compara `schemas`, `fieldLibrary`, `kinship`, `calendar`, `kind` y `schemaFolders` con la versión de la que parte y responde `403 cambio_de_esquema_no_permitido`). Lector, o un rol desconocido: leer. Borrar el grupo: solo la propiedad.
- **Rutas** (con el token de la plataforma, como el resto):
  - `GET /api/grupos`: los grupos activos de la cuenta, con su `spaceId`, rol, `isOwner`, capacidades y proyectos (versión y resumen).
  - `POST /api/grupos/actualizar`: lee el feed ya (tras aceptar una invitación o cambiar un rol) y devuelve la lista.
  - `POST /api/grupos` `{ id, name, document }`: crea el espacio a nombre de quien lo pide (con el rol `responsable` y la propiedad) y hace del documento el proyecto del grupo. La copia personal queda borrada en la cuenta. Repetirla con el mismo `id` no crea otro espacio. Errores: `proyecto_ya_compartido` y `grupo_ya_existe` (409), `creacion_limitada` (403), los límites de espacios (429) y `plataforma_no_disponible` (424; 424 y no 502, que Cloudflare tapa).
  - `GET` y `PUT /api/grupos/{grupo}/proyectos/{id}` (`{ document, baseVersion }`): leer (miembro activo) y escribir (con `edit`); con otra versión, `409 version_conflict` con la vigente y quién la escribió. Nunca gana en silencio el documento más reciente.
  - `DELETE /api/grupos/{grupo}?recipient=<cuenta>`: solo la propiedad; el proyecto pasa a ser un proyecto propio de la cuenta elegida (un miembro activo, o ella misma) y después se borra el espacio. Si la plataforma falla, el grupo queda `borrando` y el mantenimiento lo termina.
- **Proyectos propios.** `PUT /api/projects/{id}` responde `409 proyecto_compartido` si ese id es de un grupo del que la cuenta es miembro: otro dispositivo con la copia de antes no la resucita como proyecto propio. Quien no es del grupo puede tener su propia copia con ese id (de un JSON importado).
- **Feed.** `espacio.creado`/`cambiado` (nombre, propietario tras un traspaso), `espacio.borrado` (si lo borra la plataforma porque no queda nadie, el proyecto se va con él), `miembro.entrado`/`cambiado`/`salido`, en la misma transacción que el cursor.
- Publicada en producción el 2026-10-17 (`c0f8e01`): copia verificada `Nodaria-antes-de-0009-20261017.bak`, migración 0009 en `NodariaDev` y `Nodaria`, API reiniciada (salud correcta, `/api/grupos` 401 sin token, roles declarados en la plataforma de producción).

### Frontend de los hitos 1 y 2 (2026-10-17)

- **Reglas puras** en `src/services/groups.ts` (con `groups.test.ts`): llamadas a `/api/grupos*` y a la pertenencia de la plataforma (`/v1/espacios/*` con `yosiftware.tokenPlataforma()`, en `PLATFORM_API_URL`, deducida del SDK del entorno); `planShared` (bajar, subir, soltar); `contentSignature` (huella SHA-256 del proyecto sin `view` ni `updatedAt`); `blockedReason` y `SCHEMA_ACTIONS` (qué deja hacer el rol).
- **Motor** en `src/state/groups.tsx` (`GroupsProvider`, entre `AuthProvider` y `SyncProvider`), aparte de la sincronización de los propios, que excluye los compartidos (`isShared`) y, con `409 proyecto_compartido`, los deja al motor. Recuerdo por cuenta en `nodaria_shared_v1` (grupo, versión y huella de cada compartido). Lee los grupos al entrar, cada minuto con la pestaña visible, al volver a ella o recuperar la conexión, y 2,5 s después de cada cambio en un compartido. Sube con la versión de la que parte; si otra persona guardó antes (409) o el rol ya no deja (403), baja la del grupo y guarda lo de aquí como un proyecto propio «(tus cambios)». Nunca gana en silencio el último. La vista del mapa es de cada persona: no cuenta como cambio y se conserva al bajar. Lo que se edita mientras se baja no se pisa (se resuelve en la vuelta siguiente). Al perder el acceso, el compartido sale del navegador, salvo los cambios sin subir, que quedan aparte. Una copia local con el id de un compartido que no se recuerda se compara al bajar y, si difiere, queda aparte.
- **Deshacer:** una versión bajada del grupo vacía el historial (`sync-apply` con `fresh`): deshacer no repone lo de antes de los cambios de otra persona.
- **Permisos en la interfaz:** `AppContext` admite un filtro de acciones (`setActionGuard`). Con un compartido abierto, el lector solo navega, cambia su vista y duplica; el editor no cambia el esquema; nadie lo elimina como si fuera propio (se sale o se borra el grupo). Un aviso explica por qué. Desde el 2026-10-17, `useProjectAccess` (`src/state/groups.tsx`) enseña lo que no se puede cambiar: los valores de las fichas y la tabla (`FieldControl`) quedan en solo lectura para el lector, y el editor de tipos y la vista Propiedades para el lector y el editor (un `fieldset` deshabilitado con `display: contents`, `.access-lock`; la lista de tipos se sigue pudiendo recorrer). La insignia del grupo lleva un candado si el rol solo lee.
- **Interfaz** (`src/components/groups/`, `src/styles/groups.css`): engranaje → «Compartir con un grupo…» (`ShareDialog`, crea el grupo con el proyecto) o «Grupo «…»…»; insignia del rol junto al proyecto e icono de grupo en la lista de proyectos. `GroupDialog`: miembros (con el SDK), cambiar rol, sacar, ceder la propiedad, invitar por correo con rol, invitaciones pendientes y retirarlas, salir y, para la propiedad, borrar el grupo eligiendo quién se queda el proyecto. Menú de la cuenta → «Invitaciones a grupos» (ventana del SDK). Al aceptar una invitación (`yosiftware:espacio`), la API lee el feed (con reintentos) y se abre el proyecto del grupo.
- **Verificado:** lint, tipos y 317 pruebas del front; Edge sin ventana con el SDK y la API simulados: compartir, miembros, invitar, subir un cambio (versión 2), no subirlo como propio, bajar el cambio de otra persona, pasar a lector y que se le bloquee y explique, y el diálogo a 390 px; sin errores de JavaScript. El desbordamiento horizontal a 390 px de la barra de vistas es anterior a este cambio. **No probado con cuentas reales**: lo prueba el propietario en producción.

### Concurrencia y tiempo real

- Introducir operaciones de dominio identificables y revisiones por proyecto, conservando instantáneas para carga y exportación. El servidor comprueba membresía, capacidad y reglas de integridad antes de confirmar.
- Cada operación lleva un ID de cliente y una base conocida; confirmar contenido, secuencia y tarea de publicación en una transacción. Repetirla devuelve el resultado anterior.
- Combinar cambios independientes solo cuando sea seguro. Dos cambios del mismo campo deben mostrar un conflicto o impedirse mediante una reserva temporal; no elegir silenciosamente el último documento entero.
- Serializar las operaciones que afectan a invariantes compartidas: dos movimientos concurrentes no pueden crear un ciclo; borrar un tipo/nodo debe coordinarse con quien lo edita o crea relaciones. La validación del frontend no es la autoridad.
- Las ediciones del formulario pueden seguir teniendo un borrador local; «en tiempo real» significa que los demás ven el cambio confirmado, no cada pulsación. Edición simultánea de texto con combinación automática queda fuera inicialmente.
- Deshacer en un proyecto compartido debe generar una operación inversa propia que preserve lo de otros y compruebe si sigue siendo aplicable. Hasta disponer de ello, deshabilitar explícitamente el deshacer de instantáneas en compartidos; nunca reutilizarlo como si fuese seguro.
- Entregar solo a miembros autorizados del proyecto. Secuencia/cursor, reconexión, operaciones duplicadas y relectura de instantánea si caduca el historial. Comprobar los permisos también al suscribirse y durante conexiones abiertas.
- Revocar escritura, lectura y entrega de eventos al perder acceso. Retirar la copia de trabajo de la cuenta según la política de caché, sin prometer borrar archivos ya exportados.
- Al perder conexión, avisar y pausar la edición compartida inicialmente. Conservar un borrador pendiente para recuperar/descargar sin reenviar después un documento que pise todo el proyecto. La edición offline con fusión automática sería otro alcance.
- Zoom, selección, pestaña, scroll, filtros y encuadre de cada persona son estado individual. Las posiciones fijadas y las vistas guardadas publicadas pueden ser comunes. Revisar `Project.view` y las disposiciones actuales para que un usuario no cambie la vista de todos al navegar.
- Presencia en el tablero es efímera y específica de ese proyecto. La presencia de amistades del chat central no demuestra quién tiene ese tablero abierto.

## Hitos y criterios de finalización

Sin fechas comprometidas. Se activan en orden por dependencias y con la migración terminada; cada hito debe dejar algo verificable. La priorización de esta iniciativa frente a la renovación pendiente se decide al activarla.

### Hito 0 — Migración terminada y contratos acordados

Responsables: Nodaria y plataforma. Es una condición de entrada, no una orden de migrar ahora.

- [x] Recibir la guía propia, terminar la migración y comprobar que los proyectos del propietario y su administración se conservan (2026-10-15, `ROADMAP_MIGRACION_YOSIFTWARE.md`).
- [x] Cumplir la lista de integración central y resolver la congelación en el contexto vivo: lista cumplida en la migración; congelación levantada para Nodaria por el propietario el 2026-10-17. La sección «Espacios» de la lista se cumple con los hitos 1 a 4.
- [x] Resolver la petición de coordinación: invitaciones por correo, avisos a quien no visitó Nodaria y transporte de eventos del tablero (2026-10-17, los espacios).
- [x] Confirmar límites, restricciones de cuenta, revocación y el significado de lector respecto al chat: los de la plataforma (`ecosistema-kit/ESPACIOS.md`); el lector conversa (`chat: escribir`).
- [x] Aprobar el primer alcance: grupo con un proyecto, roles base y grupos sin cuenta aplazados (propietario, 2026-10-17, al pedir que se implemente).

**Termina cuando:** la migración está verificada y existen guías/contratos publicados o una alternativa expresamente acordada para los huecos. No programar contra rutas imaginadas. Una ampliación opcional puede quedar descartada por escrito sin bloquear todo el producto.

### Hito 1 — Modelo compartido y protección de datos

Responsable: Nodaria. Depende del hito 0.

- [x] Diseñar grupo, proyecto único, membresías, capacidades e invitaciones; separar recursos personales y compartidos (2026-10-17, «Contrato del hito 1»). Lint, tipos y 64 pruebas de la API, también contra SQL Server en una base desechable.
- [x] Definir migración de almacenamiento, propiedad y borrado de cuentas con copia y ensayo en QA: migración 0009 probada y aplicada con copia verificada; sin ensayo en QA por decisión del propietario (2026-10-17).
- [x] Excluir los compartidos del motor actual de subida/borrado por ausencia; decidir caché por cuenta y preferencias individuales (la vista, de cada persona).
- [x] Diseñar operaciones y revisiones, validación de integridad y deshacer seguro (o su suspensión explícita inicial): revisiones por documento con conflicto explícito; deshacer no cruza una versión bajada. Las operaciones finas quedan para el hito 3.
- [x] Maquetar los flujos de grupos, miembros, compartir, conflictos y permisos antes de implementarlos: el propietario decide pasar directamente a programarlos (2026-10-17).

**Termina cuando:** están definidos los contratos de Nodaria y la migración ensayada sin perder proyectos; se demuestra que cambiar de cuenta, borrar una copia local o abandonar un grupo no borra el proyecto de los demás.

### Hito 2 — Compartir con cuentas y permisos

Responsable: Nodaria, usando identidad/entrega acordadas. Depende del hito 1.

- [x] Crear un grupo/proyecto compartido y convertir un proyecto propio conservando contenido e identidad.
- [x] Invitar, aceptar, rechazar, revocar, salir, cambiar rol y transferir propiedad (con la plataforma y su SDK).
- [x] Implementar propietario, responsable, editor y lector, con capacidades visibles. Los nombres por categoría de proyecto quedan para el hito 5.
- [x] Autorizar cada lectura/escritura/exportación desde la API y verificar los conflictos de revisión.
- [x] Impedir que una invitación revocada o un cambio de rol tardío concedan permisos antiguos: la plataforma lleva las invitaciones y la API autoriza con la copia del feed en cada petición.

**Termina cuando:** dos cuentas ven el mismo proyecto y pueden colaborar por turnos; lector no escribe ni llamando directamente a la API; un tercero no obtiene datos; nunca desaparece una versión por elegir el documento más reciente. Pruebas de invitación doble, expulsión, transferencia y edición concurrente incluidas.

### Hito 3 — Cambios visibles en tiempo real

Responsable: Nodaria; transporte según respuesta de la plataforma. Depende del hito 2.

- [x] Confirmar y distribuir operaciones con secuencia e idempotencia, usando la autorización del tablero: por versiones del documento (la versión es la secuencia; `idExterno` `<proyecto>-v<versión>` en el canal), no por operaciones sueltas.
- [x] Ver cambios de nodos, relaciones, notas, esquema y posiciones comunes mientras otras cuentas lo tienen abierto.
- [x] Recuperar cambios tras un corte o recargar la instantánea si el cursor quedó antiguo (el SDK recupera lo perdido; con `desfase`, `cerrado` o `error` se relee de la API; y el sondeo cada minuto).
- [x] Mostrar borradores/conflictos y «sin conexión»; impedir sobrescrituras por el motor de sincronización antiguo: conflictos con aviso y copia «(tus cambios)», el motor antiguo excluido, y un icono en la insignia del grupo cuando no se llega al servidor (`syncState`).
- [x] Resolver y comprobar el deshacer propio frente a cambios ajenos; presencia del tablero opcional después de asegurar los datos (deshacer no cruza una versión bajada; presencia en la insignia y en el diálogo del grupo).

### Clave de IA del grupo (2026-10-17)

- Decisión del propietario: la clave del grupo, solo en sus proyectos. Como cada proyecto compartido es el de su grupo, «los compartidos que marque el administrador» no existen todavía; si llegan proyectos de varios grupos o proyectos propios prestados, se añade esa marca.
- **API** (`api/src/routes/ai.ts`, `api/src/ai/assistant.ts`): en un proyecto del grupo, si la cuenta es miembro activo, la llamada a la pasarela lleva `X-Yosi-Espacio` con el id del espacio. Los errores del grupo se explican aparte: `sin_clave_del_grupo` y `tope_del_grupo` (se ofrece la clave propia), `proveedor_no_permitido`, `modelo_no_permitido`, `espacio_no_disponible`. Nunca pasa a la clave de la persona por su cuenta: solo con `keySource: 'personal'`, que pide el panel. La respuesta dice qué clave se usó (`keySource`).
- **Panel:** en un proyecto del grupo dice qué clave usa y, si la del grupo no sirve, ofrece «Usar mi clave de IA en este proyecto (el gasto será tuyo)», con «Volver a la del grupo». La política de privacidad lo explica.

### Tiempo real y combinación (hito 3, 2026-10-17)

- **API:** tras guardar el proyecto del grupo, publica en el canal del espacio `{ tipo: 'proyecto', id, version, por }` con `idExterno` `<proyecto>-v<versión>` (solo la referencia; el canal admite 16 KB). Tras aplicar cambios de pertenencia del feed, `{ tipo: 'grupo' }` con `idExterno` `miembros-<id del cambio>` (`createFeedReader`, `onSpaces`). Si publicar falla se registra: lo recoge el sondeo.
- **Frontend:** `GroupsProvider` abre el canal del grupo del proyecto abierto (`yosiftware.espacios.canal`). Un aviso de una versión que este navegador no tiene, `grupo`, `desfase`, `cerrado` o `error` lanzan la sincronización; `abierto` y `presencia` dan quién lo tiene abierto (insignia «+N» y «conectado» en el diálogo del grupo).
- **Combinar** (`src/services/merge.ts`, con pruebas): si cambiaron los dos lados (o la subida da 409), combina a tres bandas con la versión base que el navegador guarda de cada compartido (IndexedDB, `backups`, clave `shared-base:<id>`; sin IndexedDB, en memoria). Listas con `id` (o `{ ref }`) elemento a elemento y objetos clave a clave: lo que cambió un solo lado se queda; el mismo dato cambiado distinto en los dos es un conflicto y gana el grupo, con aviso y la versión de aquí completa en «(tus cambios)»; borrar lo que el otro cambió lo conserva. El resultado se repara (`prepareProject`: ciclos, referencias rotas) y se sube con la versión del grupo; si otra persona vuelve a guardar, se repite (hasta tres vueltas). Sin versión base, se guarda aparte lo de aquí como antes.
- **Verificado:** 66 pruebas de la API (con el canal y el lector del feed) y 323 del front (con la combinación); Edge con la plataforma y la API simuladas: dos cambios a la vez en partes distintas se combinan sin copia (versión 5), un aviso del canal baja el cambio al momento y la insignia cuenta a la otra persona conectada; sin errores de JavaScript. No probado con cuentas reales, cortes de red ni varias pestañas.

**Termina cuando:** dos cuentas editan elementos distintos sin pérdidas, el mismo campo produce el resultado/conflicto definido, los movimientos no introducen ciclos, un reintento no duplica operaciones y expulsar a una cuenta conectada detiene su acceso. Probar cortes de red, varias pestañas y reinicio del proceso.

### Hito 4 — Chat y entrega completa de invitaciones

Responsables: integración en Nodaria y servicios centrales. Depende del hito 2 y de los contratos correspondientes; puede adelantarse al hito 3 si estos ya están resueltos.

- [x] Pedir la conversación del espacio (`PUT /v1/servicio/espacios/{idExterno}/conversacion`) para incrustar el chat: `POST /api/grupos/{grupo}/conversacion` (cualquier miembro activo; la plataforma la crea la primera vez y la devuelve después), sin guardar el id: se pide al abrir el chat. Los participantes los pone la plataforma.
- [x] Incrustar el chat común (`<yosi-chat-conversacion>`): panel lateral `GroupChatPanel` (`src/components/groups/`), con el botón de chat junto a la insignia del grupo, anchura ajustable (`preferences.groupChatWidth`) y los colores de Nodaria; a pantalla completa en el móvil. Sin notificaciones propias por ahora (las de la invitación y del chat ya las da la plataforma). Los mensajes no pasan por Nodaria.
- [ ] Comprobar de punta a punta el correo y el aviso de la invitación de la plataforma (en producción; en QA el correo no sale): queda para la prueba del propietario con su cuenta de empresa.

**Termina cuando:** la invitación funciona para una cuenta usuaria de Nodaria, otra cuenta central que nunca entró y una persona que se registra; no hay entregas duplicadas; entrar/salir del grupo se refleja en el chat incluso después de un fallo temporal del servicio. Mostrar el estado pendiente de integración; no afirmar revocación inmediata del chat si todavía está por aplicarse en la plataforma.

### Hito 5 — Revisión y usos especializados

Responsable: Nodaria. Depende de los hitos 2 y 3.

- [ ] Añadir comentarios y sugerencias ligados al proyecto/nodo, distintos del chat, con autoría e historial.
- [ ] Incorporar el rol revisor con lectura y propuestas, y aceptar cambios mediante una acción autorizada del editor/responsable.
- [ ] Validar vocabularios con escritura, empresa, rol y lectura; permitir etiquetas propias sin permisos arbitrarios.
- [ ] Valorar varios proyectos por grupo y los permisos por proyecto antes de ampliar la primera interfaz.

**Termina cuando:** un revisor puede proponer sin alterar el tablero, una persona autorizada acepta con un cambio trazable y cada denominación muestra sus capacidades reales. No introduce dependencia de Fichas o Libros para usar Nodaria.

### Hito 6 — Piloto, operación y lanzamiento

Responsables: Nodaria y propietario. Depende de las funciones que se decida incluir en la entrega; el hito 5 puede quedar para una entrega posterior.

- [ ] Ensayar en QA los flujos de permisos, concurrencia, invitaciones, cuenta cerrada/borrada y fallos parciales.
- [ ] Definir tamaño/número de proyectos, miembros simultáneos, retención de historial y límites de entrega; medir con proyectos reales grandes, incluidas imágenes.
- [ ] Verificar copias/restauración de grupos, proyectos, membresías y tareas pendientes, además del rollback de la migración.
- [ ] Documentar en la política de datos los nuevos grupos, destinatarios de invitaciones y registros de cambios, siguiendo las guías centrales vigentes.
- [ ] Revisar interfaz en escritorio/móvil, uso local sin sesión y exportación/importación sin credenciales, miembros ni invitaciones.
- [ ] Revisar CSP/SDK y, si afecta al script de medición, seguir las instrucciones de Yosiftadísticas. Operación propia mediante el plugin de Administración cuando corresponda.
- [ ] Completar lint, build y pruebas aplicables; publicar según el flujo vigente y comprobar la revisión y comportamiento servidos.

**Termina cuando:** el piloto funciona con varias cuentas, no quedan fallos de pérdida de datos o acceso indebido, las copias se restauran y están documentadas las limitaciones que persistan. No presentar como lanzada una funcionalidad solo porque compila.

### Hito opcional — Colaboración sin crear cuentas

**Aplazado; no bloquea los hitos anteriores.** Primero comprobar la demanda tras el piloto.

- [ ] Decidir si basta el intercambio de JSON que ya existe o hace falta acceso al recurso del servidor.
- [ ] Si se mejoran archivos: identificarlos como copias independientes, añadir comparación/vista previa antes de incorporar cambios; nunca reemplazar en silencio un tablero compartido.
- [ ] Si se necesitan invitados al mismo tablero: acordar con la plataforma una identidad de invitado, enlaces personales revocables, límites, recuperación y auditoría. No prometer «sin cuenta» mediante una contraseña común del grupo.
- [ ] Definir lectura/escritura del servidor para esos invitados, sin chat ni grupos sociales centrales y sin cambios en tiempo real en esta modalidad, conforme a la propuesta inicial.
- [ ] Ofrecer el alta central para pasar a la colaboración completa conservando el trabajo; diseñar cómo convertir una copia o identidad de invitado en cuenta.

**Límite esencial:** una copia JSON entregada a otra persona puede editarse y volver a copiarse fuera de Nodaria. Marcarla como lectura en la interfaz no protege el archivo ni permite revocarlo. Los permisos de lectura/escritura fiables corresponden al acceso al servidor; un archivo exportado exige un acuerdo entre las personas.

**Termina cuando:** se decide explícitamente implementar esta modalidad o descartarla. Mantener Nodaria útil sin cuenta no obliga a mantener un segundo sistema de colaboración sin identidad.

## Relación con clubes de lectura y grupos de rol

Compartir patrones de invitación, aceptación, bloqueo, membresía, entrega y conversación de comunidad. Cada web conserva su dominio: campaña y LFG en Fichas; club y lecturas en Libros; grupo y mapas en Nodaria. Compartir cuenta o chat no concede acceso a los datos de otra web.

Proponer a la plataforma el mecanismo común de entrega por correo y, si compensa, el transporte de avisos de datos propios. No trasladar a Administración todos los grupos ni crear una organización transversal hasta que exista esa necesidad y un contrato acordado.

## Seguimiento

- [x] Recoger la propuesta y la aclaración sobre grupos sin cuenta.
- [x] Contrastar viabilidad con Nodaria y el contrato local de la plataforma.
- [x] Documentar reparto, huecos, roles, riesgos y criterios por hito.
- [x] Entregar la petición documental de coordinación a Administración y conservar copia en Nodaria.
- [x] Recibir respuesta y actualizar las dependencias sin marcar disponibles capacidades no publicadas: los espacios, en QA y producción desde el 2026-10-17 (puesta al día del 2026-10-17, con la petición `docs/peticiones/usar-los-espacios-en-la-colaboracion.md`).
- [x] Terminar la migración (2026-10-15).
- [x] Revisar la puesta al día de la plataforma (2026-10-17, «Revisión de Nodaria»).
- [x] Activar este roadmap (2026-10-17, el propietario: «podemos comenzar a implementar»): kit 1.38 copiado (ignorado por Git) y reescritos el reparto, los huecos, las invitaciones y el hito 4.

Todas las casillas de implementación permanecen abiertas. Las propuestas técnicas y de permisos de este documento no son decisiones aprobadas por el propietario hasta validarse en el hito correspondiente.
