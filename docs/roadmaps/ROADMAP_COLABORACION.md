# Roadmap por hitos: grupos de trabajo y colaboración

Fecha: 2026-10-13.
Estado: **planificado, en espera de la migración de Nodaria a la plataforma Yosiftware**. Solo documentación; ningún hito de implementación está iniciado. No sustituye al roadmap principal vigente.

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

| Pieza                                                                    | Responsable                                      | Situación                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Cuenta, alta, sesión, perfil, identidad global                           | Plataforma Yosiftware                            | Servicio común; Nodaria lo integra durante su migración.                                                           |
| Grupos de trabajo, proyectos, miembros, roles y permisos del tablero     | Nodaria                                          | Dominio propio. La plataforma decidió que las comunidades se quedan en cada web.                                   |
| Documento compartido, validación de operaciones, revisiones y conflictos | API de Nodaria                                   | Trabajo nuevo después de la migración.                                                                             |
| Chat, mensajes, historial y moderación del chat                          | Plataforma                                       | Disponible. Usar las conversaciones de la web y los componentes del SDK.                                           |
| Pertenencia al chat del grupo                                            | Nodaria decide; plataforma la aplica             | `PUT /v1/servicio/chat/conversaciones/{idExterno}` con la lista completa de miembros.                              |
| Centro de notificaciones y push                                          | Plataforma                                       | Disponible; catálogo y emisión desde la API de Nodaria.                                                            |
| Invitación al proyecto, permiso ofrecido y aceptación                    | Nodaria                                          | Necesita colaboración de la plataforma para entregar por correo e identificar al destinatario con privacidad.      |
| Envío de correo y aviso antes de la primera visita                       | Por acordar con la plataforma                    | No hay contrato público revisado que lo cubra. No asumir que push también envía email.                             |
| Transporte de cambios del tablero y presencia en él                      | Por acordar; contenido y autorización de Nodaria | No hay ruta pública genérica de emisión de eventos de proyectos. El tiempo real central sirve sus eventos propios. |
| Panel del propietario para operaciones de Nodaria                        | Plugin de Nodaria en Administración              | No confundir administración del ecosistema con el rol de responsable de un grupo.                                  |

La API de Nodaria sigue alojando sus datos y aplicando sus reglas. Administración no construye automáticamente el servidor de colaboración: aporta los servicios comunes y decide su contrato. No crear un segundo chat ni un segundo sistema de cuentas.

### Huecos de integración

1. **Invitación por email:** las invitaciones de `/v1/chat/…` son a grupos de chat y cuentas existentes; no conceden pertenencia a un proyecto de Nodaria. El contrato no expone un envío de correo de servicio ni búsqueda privada de destinatarios por correo para esta finalidad.
2. **Cuenta existente que nunca ha entrado en Nodaria:** las notificaciones de servicio y las conversaciones de la web solo admiten cuentas que ya han entrado en ella. No se puede prometer un aviso interno inmediato a todas las cuentas existentes sin acordar una extensión o una alternativa.
3. **Cambios de tablero:** escuchar `yosiftware.tiempoReal` no permite publicar automáticamente eventos de Nodaria. La plataforma debe confirmar si ofrece un transporte común o si Nodaria necesita uno propio para sus datos. No usar avisos de chat/notificaciones por cada edición como sustituto.
4. **Solo lectura en el chat:** las conversaciones de la web aceptan `miembros` y `cerrada`, no un permiso de escritura por participante. En el diseño inicial, lectura del tablero y participación en el chat son permisos distintos. Si se exige lectura del chat por persona, requiere ampliar el contrato; ocultar el campo de escribir en Nodaria no lo impide desde otras webs.

Petición de coordinación: [`acordar-invitaciones-y-tiempo-real-para-la-colaboracion-de-nodaria.md`](../peticiones-enviadas/acordar-invitaciones-y-tiempo-real-para-la-colaboracion-de-nodaria.md). Entregada como documento a la carpeta de peticiones de Administración; pendiente de resolución. No encarga implementar Nodaria ni altera su prioridad de migración.

## Diseño recomendado, pendiente de validar al activar los hitos

### Grupo, proyecto y pertenencia

- Distinguir el grupo de trabajo del proyecto y de su conversación. Modelo preparado para varios proyectos, con una primera interfaz de **un proyecto por grupo** para limitar complejidad.
- Primera versión: los miembros del grupo tienen el mismo acceso a ese proyecto. No añadir todavía excepciones por nodo ni mezclar en un mismo chat personas con acceso a distintos proyectos privados.
- Un proyecto compartido tiene una única identidad y una única versión del contenido en el servidor, independientemente de cuántas cuentas lo abran. No duplicarlo por miembro.
- Mantener un único propietario del grupo/proyecto inicial. Transferir la propiedad de forma transaccional; el propietario no puede salir dejando el grupo sin responsable. Responsable de grupo y administrador del ecosistema son conceptos distintos.
- Representar cuentas con el ID global obtenido después de la migración; el correo sirve para entregar una invitación, no como clave de autorización permanente.
- Registrar membresías, invitaciones, revisiones y tareas de integración fuera del JSON portable. Importar un proyecto crea una copia propia, no hereda accesos del servidor.
- Separar «salir del grupo» y «quitar la copia de este navegador» de «eliminar el proyecto compartido». No deducir el borrado del servidor porque falte un proyecto en la lista local.
- Al cerrar/borrar una cuenta, aplicar la política de la plataforma y resolver la propiedad compartida sin un borrado en cascada de los datos de otras personas. Definir transferencia, archivo y plazos antes de compartir datos reales.

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

Flujo deseado: crear la invitación en Nodaria → confirmar la transacción → solicitar sus entregas → el destinatario abre Nodaria → entra o crea su cuenta central → ve grupo y permiso ofrecido → acepta o rechaza → Nodaria confirma la pertenencia → pone al día el chat.

- Objetivo: email para ambos casos y aviso interno para cuentas existentes cuando lo permita el contrato acordado. Respetar preferencias, bloqueos y restricciones; no revelar al remitente si el correo está registrado ni quién lo bloqueó.
- Si la cuenta ya existe pero nunca ha entrado en Nodaria, utilizar el flujo que acuerde la plataforma; no fabricar una entrada en esa web ni conceder acceso en segundo plano.
- Enlace con secreto aleatorio de un solo uso, guardado como huella, caducidad y revocación. La invitación ofrece el permiso, pero la API comprueba de nuevo al aceptar que el remitente mantiene autoridad y el grupo sigue vigente.
- La cuenta que acepta debe demostrar que corresponde al destinatario según el mecanismo documentado por la plataforma; estar autenticado con cualquier correo no basta. Cubrir correo cambiado, Google vinculado, otra cuenta abierta, alta incompleta y registro central cerrado.
- Aceptación atómica e idempotente: dos clics o dos pestañas no duplican la membresía. Estados: pendiente, aceptada, rechazada, caducada y revocada; limitar envíos y reenvíos.
- Usar tareas pendientes de integración en la misma transacción y claves externas estables para reintentar sin duplicar entregas. La pertenencia no depende de que el email o el chat respondan al momento.
- En el contrato actual, los botones de las notificaciones de una web son enlaces a Nodaria; aceptar allí exige su API, no una acción de chat que conceda acceso al proyecto.

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

- [ ] Recibir la guía propia, terminar la migración y comprobar que los proyectos del propietario y su administración se conservan.
- [ ] Cumplir la lista de integración central y resolver la congelación en el contexto vivo.
- [ ] Resolver la petición de coordinación: invitaciones por correo, avisos a quien no visitó Nodaria y transporte de eventos del tablero.
- [ ] Confirmar límites, restricciones de cuenta, revocación y el significado de lector respecto al chat.
- [ ] Aprobar el primer alcance: grupo con un proyecto, roles base y grupos sin cuenta aplazados.

**Termina cuando:** la migración está verificada y existen guías/contratos publicados o una alternativa expresamente acordada para los huecos. No programar contra rutas imaginadas. Una ampliación opcional puede quedar descartada por escrito sin bloquear todo el producto.

### Hito 1 — Modelo compartido y protección de datos

Responsable: Nodaria. Depende del hito 0.

- [ ] Diseñar grupo, proyecto único, membresías, capacidades e invitaciones; separar recursos personales y compartidos.
- [ ] Definir migración de almacenamiento, propiedad y borrado de cuentas con copia y ensayo en QA.
- [ ] Excluir los compartidos del motor actual de subida/borrado por ausencia; decidir caché por cuenta y preferencias individuales.
- [ ] Diseñar operaciones y revisiones, validación de integridad y deshacer seguro (o su suspensión explícita inicial).
- [ ] Maquetar los flujos de grupos, miembros, compartir, conflictos y permisos antes de implementarlos.

**Termina cuando:** están definidos los contratos de Nodaria y la migración ensayada sin perder proyectos; se demuestra que cambiar de cuenta, borrar una copia local o abandonar un grupo no borra el proyecto de los demás.

### Hito 2 — Compartir con cuentas y permisos

Responsable: Nodaria, usando identidad/entrega acordadas. Depende del hito 1.

- [ ] Crear un grupo/proyecto compartido y convertir un proyecto propio conservando contenido e identidad.
- [ ] Invitar, aceptar, rechazar, revocar, salir, cambiar rol y transferir propiedad.
- [ ] Implementar propietario, responsable, editor y lector, con nombres por categoría y capacidades visibles.
- [ ] Autorizar cada lectura/escritura/exportación desde la API y verificar los conflictos de revisión. Sin actualización automática aún: ofrecer recargar y avisar ante una versión incompatible.
- [ ] Impedir que una invitación revocada o un cambio de rol tardío concedan permisos antiguos.

**Termina cuando:** dos cuentas ven el mismo proyecto y pueden colaborar por turnos; lector no escribe ni llamando directamente a la API; un tercero no obtiene datos; nunca desaparece una versión por elegir el documento más reciente. Pruebas de invitación doble, expulsión, transferencia y edición concurrente incluidas.

### Hito 3 — Cambios visibles en tiempo real

Responsable: Nodaria; transporte según respuesta de la plataforma. Depende del hito 2.

- [ ] Confirmar y distribuir operaciones con secuencia e idempotencia, usando la autorización del tablero.
- [ ] Ver cambios de nodos, relaciones, notas, esquema y posiciones comunes mientras otras cuentas lo tienen abierto.
- [ ] Recuperar cambios tras un corte o recargar la instantánea si el cursor quedó antiguo.
- [ ] Mostrar borradores/conflictos y «sin conexión»; impedir sobrescrituras por el motor de sincronización antiguo.
- [ ] Resolver y comprobar el deshacer propio frente a cambios ajenos; presencia del tablero opcional después de asegurar los datos.

**Termina cuando:** dos cuentas editan elementos distintos sin pérdidas, el mismo campo produce el resultado/conflicto definido, los movimientos no introducen ciclos, un reintento no duplica operaciones y expulsar a una cuenta conectada detiene su acceso. Probar cortes de red, varias pestañas y reinicio del proceso.

### Hito 4 — Chat y entrega completa de invitaciones

Responsables: integración en Nodaria y servicios centrales. Depende del hito 2 y de los contratos correspondientes; puede adelantarse al hito 3 si estos ya están resueltos.

- [ ] Crear una conversación de la web por grupo con un ID externo estable; guardar el ID central para incrustar el chat.
- [ ] Poner al día los miembros después de confirmar la transacción; reintentos que consulten la membresía vigente y serialicen actualizaciones para no reintroducir expulsados por una tarea antigua.
- [ ] Reconciliar `ignoradas` después de que una cuenta válida entre en Nodaria y gestionar el archivo del grupo.
- [ ] Incrustar el chat común y las notificaciones; no copiar mensajes a la base de Nodaria.
- [ ] Completar email/aviso interno conforme al contrato, con preferencias, caducidades, reenvíos y bloqueos.

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
- [ ] Recibir respuesta y actualizar las dependencias sin marcar disponibles capacidades no publicadas.
- [ ] Terminar la migración y elegir cuándo activar este roadmap.

Todas las casillas de implementación permanecen abiertas. Las propuestas técnicas y de permisos de este documento no son decisiones aprobadas por el propietario hasta validarse en el hito correspondiente.
