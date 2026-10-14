# Petición a la plataforma Yosiftware: acordar invitaciones y transporte de cambios para colaboración en Nodaria

Fecha: 2026-10-13.
Solicitante: Nodaria (`C:/Users/Yosi/Desktop/nodaria`).
Afecta a: invitaciones por correo a comunidades propias, notificaciones previas a la primera visita y transporte de eventos de proyectos.
Estado de envío: entregada como documento en `C:/Users/Yosi/Desktop/administracion yosiftware/docs/peticiones/`, sin resolución. No solicita iniciar código ni adelantar la migración.

## Contexto

El propietario quiere dejar planificada la colaboración en Nodaria y no modificar la web hasta que termine su migración. Roadmap de origen: `C:/Users/Yosi/Desktop/nodaria/docs/roadmaps/ROADMAP_COLABORACION.md`.

La idea incluye grupos de trabajo, lectura/escritura del tablero, invitaciones por email, chat del grupo y cambios visibles al momento. Para una cuenta existente quiere aviso interno y correo; para alguien sin cuenta, correo y alta central antes de aceptar. Ha aclarado que también valoraba grupos sin crear cuentas, pero acepta obviarlos si complican demasiado: Nodaria recomienda aplazarlos.

Se ha contrastado con `docs/agentes/CONTEXTO_PROYECTO.md`, `docs/publica/CHAT.md`, `NOTIFICACIONES.md`, `ENDPOINTS.md`, `openapi.json`, `ecosistema-kit/CHAT.md` y `FEED_DE_CAMBIOS.md`. Se respeta la decisión de que las comunidades son de cada web y de que el chat es único.

Nodaria se ocuparía de grupos, pertenencia, permisos, invitaciones como objetos de dominio, mapas y resolución de concurrencia. Reutilizaría cuenta, conversación de la web, notificaciones y moderación centrales. Este documento pide decidir los huecos comunes, no imponer rutas ni llevar el dominio de los mapas a la plataforma.

## Qué necesitamos

1. **Entrega de invitaciones por correo** a comunidades propias, tanto a cuentas existentes como a personas sin cuenta. Confirmar si corresponde a un servicio central reutilizable por Nodaria, clubes de Libros y campañas/grupos de Fichas, o cuál es la alternativa soportada. Acordar límites, caducidad, revocación y reintentos sin duplicados.
2. **Resolver el destinatario con privacidad y aceptar después del alta.** No revelar al remitente si el correo tiene cuenta, ni obtener un directorio de correos. Nodaria necesita comprobar que la cuenta que acepta corresponde al destinatario; cubrir cuenta abierta distinta, Google vinculado, correo cambiado y registro central cerrado. Identificar qué prueba o contrato debe consumir, sin implementar verificación de identidad propia.
3. **Aviso interno a quien tiene cuenta pero nunca entró en Nodaria.** Confirmar cómo resolver esa necesidad o documentar que el aviso se entregará después de su primera visita. Respetar preferencias/bloqueos y no fingir una entrada previa en la web.
4. **Transporte para cambios propios del tablero.** Confirmar si la plataforma ofrece o prevé eventos/suscripciones autorizados de una web y presencia específica de un proyecto, o si Nodaria debe montar el transporte de sus datos. El documento, sus operaciones, revisiones, autorización y recuperación quedarían en Nodaria. Pedimos el reparto y el contrato; no usar el chat ni el centro de notificaciones por cada edición.
5. **Aclarar permisos del chat de comunidad.** El diseño inicial distingue lectura del tablero y capacidad de conversar: un lector del mapa podría escribir en el chat. Confirmar si ese reparto es el recomendado. Si se quisiera lectura del chat por participante, el contrato revisado no la ofrece; documentar ese límite o el mecanismo soportado, sin obligar a ampliarlo ahora.

## Huecos concretos detectados

- `PUT /v1/servicio/chat/conversaciones/{idExterno}` admite `titulo`, `miembros` y `cerrada`; ignora cuentas no activas o que no entraron en la web, y no recibe capacidades por miembro.
- `POST /v1/servicio/notificaciones` solo entrega a cuentas que han entrado en la web. Las preferencias pueden impedir guardar el aviso. Su documentación ofrece centro y push; no un canal email.
- Las invitaciones de `/v1/chat/…` son del chat, con cuentas y reglas propias; aceptarlas no equivale a aceptar pertenencia a un proyecto de Nodaria.
- `GET /v1/servicio/perfiles/{idCuenta}` y el feed sirven datos públicos de cuentas usuarias de esa web; no son una búsqueda por correo de destinatarios externos.
- Las rutas públicas revisadas de tiempo real son ticket y lectura de eventos centrales; no se ha encontrado una ruta de servicio para emitir eventos arbitrarios del tablero.

Estos puntos son una lectura del contrato local, no una prueba de los servicios. La plataforma debe confirmar su situación vigente.

## Comprobaciones previas

- Revisión de documentación pública y rutas de OpenAPI en solo lectura, 2026-10-13. No se han usado credenciales ni creado datos de prueba en producción.
- Nodaria guarda ahora un documento completo por cuenta/proyecto y sincroniza con versión; en conflictos conserva una versión completa. Su colaboración necesita cambios propios en datos y sincronización aunque reutilice el transporte central.
- Según vuestro contexto, las migraciones de ensayo terminaron y Fichas está activa. No se presupone guía ni migración terminada para Nodaria.

## Calendario y dependencias

Sin calendario. Se pide una resolución documental para planificar después de la migración, sin cambiar prioridades ni exigir implementar ya servicios nuevos.

El hito 0 del roadmap de colaboración espera vuestra guía/respuesta o una alternativa acordada. Se pueden descartar ampliaciones opcionales con su motivo; no presentar capacidades propuestas como disponibles. La respuesta válida debe quedar en `docs/publica/`, enlazada desde su índice, y en el kit si afecta a su consumo.

## Fuera de alcance

- Ejecutar o adelantar la migración de Nodaria.
- Implementar aquí grupos, roles del mapa, operaciones de nodos o la combinación de cambios.
- Unificar clubes, campañas y grupos de trabajo en una organización central.
- Crear otro chat o guardar sus mensajes en Nodaria.
- Dar acceso al tablero al aceptar una invitación de chat.
- Implementar invitados sin cuenta en la primera entrega.
- Publicar, enviar emails reales o modificar servicios en esta sesión.

## Resolución

<!-- La rellena la plataforma según docs/peticiones/README.md. -->
