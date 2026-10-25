# Calendario del proyecto y configuración del calendario

Fecha: 2026-10-19. Estado: **roadmap activo principal del 2026-10-19 al 2026-10-23 (lo sustituye [`ROADMAP_COMUNIDAD.md`](ROADMAP_COMUNIDAD.md)). Fases 1 a 5 implementadas y publicadas el 2026-10-22**; queda el piloto del propietario con su cuenta y dos cuentas en un grupo (fase 5), que hace la tarde del 2026-10-22. El propietario lo activó al cerrarse [`ROADMAP_COLABORACION.md`](ROADMAP_COLABORACION.md). El 2026-10-22 pidió empezarlo e implementarlo entero sin esperar: las preguntas abiertas se resolvieron con la opción recomendada y se revisan con él sobre la marcha (ver «Preguntas abiertas»).

## Objetivo

Hoy «Calendario del proyecto…» (engranaje) abre un editor de meses, días de la semana, bisiestos y fecha actual. Está pensado para mundos de ficción, pero en un proyecto normal el nombre hace creer que ahí hay un calendario de trabajo, y lo que se encuentra es la posibilidad de cambiar los meses. El propietario no quiere ocultarlo; quiere:

1. **Renombrarlo a «Configuración del calendario»**.
2. **Un calendario de verdad en cada proyecto**: días con notas y tareas, fechas de entrega, presentaciones y cosas así.
3. **Una configuración por partes**: ajustes normales arriba y, en los proyectos normales, el calendario personalizado (nombres y duraciones de meses, días de la semana, fecha fija) como extra discreto abajo del todo. En los proyectos donde tiene sentido cambiarlo (novela, rol) va arriba del todo y más vistoso.

## Situación actual (código)

- `Project.calendar` (`src/domain/calendar.ts`): meses con nombre y días, días de la semana, `firstWeekday`, `leapYears` y `today` (`null` = la fecha real). Por defecto, el gregoriano en español. Lo usan las fechas de las fichas (`DateControl` si no es estándar), `formatDate`, las fórmulas (`edad`, `dias`, `diasemana`, `{hoy}`) y la Cronología.
- `CalendarDialog.tsx`: título «Calendario del proyecto», el mismo orden para cualquier tipo de proyecto. Engranaje → «Calendario del proyecto…».
- Cronología (`TimelineView.tsx`, `src/domain/timeline.ts`): las fechas de nodos y relaciones por años, con «Hoy en el mundo». Es una historia, no una agenda: no hay notas ni tareas por día.
- Tipo de proyecto (`Project.kind`, `src/domain/projectKinds.ts`): General, Base de datos, Novela o guion, Rol y mundos de fantasía, Comercial, Desarrollo, Eventos e Investigación. Ya adapta textos y ejemplos.
- Grupos: `update-calendar` está en `SCHEMA_ACTIONS` (solo la propiedad y el responsable lo cambian). La combinación a tres bandas (`src/services/merge.ts`) combina por `id` cualquier lista de objetos con `id`, así que una lista de entradas de agenda se combinaría sin código propio.

## Decisiones

- **Dos cosas distintas con nombres distintos** (propuesta):
  - **Calendario** (vista nueva): la agenda del proyecto, con fechas **reales**. Notas, tareas, entregas y eventos o presentaciones.
  - **Calendario personalizado** (en los proyectos normales) o **Calendario del mundo** (novela y rol): cómo se cuentan los días *dentro* del proyecto. Lo usan las fichas, las fórmulas y la Cronología. Es lo que hoy edita `CalendarDialog`.
  - Motivo: en una novela, «entregar el capítulo 3 el 15 de noviembre» es una fecha real aunque el mundo use meses inventados. Mezclar las dos cosas es justo lo que confunde.
- **La agenda siempre usa el calendario real** (propuesta): gregoriano y hoy real, aunque el proyecto tenga un calendario del mundo. Los ajustes normales (primer día de la semana, días laborables, números de semana) solo afectan a la agenda.
- **Las entradas de la agenda no son nodos** (propuesta): un modelo propio y ligero, `Project.agenda`. Como nodos ensuciarían el mapa, la estructura, la Salud y los análisis, y obligarían a crear tipos para apuntar algo en un día. Una entrada puede *enlazar* nodos y mencionarlos con `[[Nombre]]`, como las notas.
- **Las fechas de las fichas también salen en la agenda cuando el calendario es el real** (propuesta): en un proyecto con calendario estándar y hoy real, los atributos de fecha (la «Fecha de entrega» de una tarea de la plantilla de Desarrollo, por ejemplo) se ven en el día que toca, de solo lectura y con un enlace a su nodo. Con un calendario del mundo no, porque serían fechas de otra cuenta; esas se quedan en la Cronología.
- **Tipos de entrada fijos para empezar** (propuesta): Nota, Tarea, Entrega y Evento (presentaciones, reuniones, sesiones), cada uno con su icono y color de los tokens. Las tareas y entregas se pueden marcar como hechas. Las categorías propias, más adelante y solo si hacen falta.
- **Qué tipos de proyecto ponen el calendario del mundo arriba**: Novela o guion y Rol y mundos de fantasía (`worldCalendar: true` en `projectKinds.ts`). El resto lo tiene abajo, plegado. Si un proyecto normal ya tiene un calendario personalizado, la sección sale **desplegada y con un aviso**, para no esconder algo que está cambiando sus fechas.
- **Permisos en un grupo**: la configuración sigue siendo de esquema (`update-calendar`, propiedad y responsable). Las entradas de la agenda son datos: el editor las crea y cambia, el revisor las comenta y el lector solo las ve.
- **Formato**: `formatVersion` 8 con `Project.agenda` (vacía por defecto) y `Project.calendar.settings`; la migración no cambia ningún proyecto existente. Exportar e importar JSON las llevan.

## Fases

### Fase 1 — Nombre y configuración por partes (hecha el 2026-10-22)

- [x] Engranaje → «Configuración del calendario…»; título del diálogo igual. Revisar los textos que dicen «calendario del proyecto» o «del mundo» (Cronología, guía de fórmulas, `FieldControl`, la ayuda) para que digan lo correcto según el tipo de proyecto. Hecho con `hasWorldCalendar(kind)` (`projectKinds.ts`) en la guía de fórmulas, la Cronología («Hoy en el mundo» solo en Novela y Rol), el recorrido y la ayuda.
- [x] `CalendarDialog` por secciones:
  - Novela y rol: **«Calendario del mundo»** arriba, destacado (tarjeta con acento y una línea que explica para qué sirve: edades, días entre fechas, Cronología), y debajo los ajustes normales.
  - Resto: ajustes normales arriba y, abajo del todo, **«Calendario personalizado (avanzado)»** plegado, con «Meses, días de la semana y fecha fija, para proyectos con un calendario inventado». Desplegado y con aviso si ya no es el gregoriano.
- [x] Mantener «Volver al calendario gregoriano» (ahora conserva los ajustes de la agenda), el aviso de fechas fuera de rango y la edición en vivo deshacible. Verificado en Edge: en Novela el calendario del mundo sale arriba; en General, plegado; con una fecha fija, desplegado y con aviso.

**Termina cuando:** en un proyecto General no se ve a primera vista nada de meses inventados; en uno de Novela o Rol es lo primero que aparece; nadie pierde su calendario personalizado.

### Fase 2 — Modelo de la agenda (dominio) (hecha el 2026-10-22)

- [x] `src/domain/agenda.ts`: `AgendaEntry { id, kind: 'note' | 'task' | 'deadline' | 'event', title, date (AAAA-MM-DD real), endDate, time, description (con menciones), done, nodeIds, assignee, createdAt }`. Funciones puras: entradas de un día, de un rango y de un nodo, vencidas (tareas y entregas sin hacer con fecha pasada) y próximas, más las fechas reales (en UTC, sin desfases por el cambio de hora), la rejilla del mes y la semana ISO. **Sin `updatedAt`**: en un grupo, dos personas que cambian cosas distintas de la misma entrada darían un conflicto falso por las dos marcas de tiempo.
- [x] `Project.calendar.settings` (`AgendaSettings` en `calendar.ts`): primer día de la semana (lunes por defecto), días laborables (lunes a viernes), números de semana y vista inicial (mes, semana o lista).
- [x] Migración a la versión 8 (`migrations.ts`) y normalización (`normalizeAgenda`): fechas imposibles, fin anterior al inicio, horas mal escritas, tipos desconocidos e ids repetidos se reparan al cargar e importar; los enlaces a nodos que no existen los quita `repairProject`, con aviso. Un título vacío se conserva y se enseña como «Sin título».
- [x] Acciones `add-agenda-entry`, `update-agenda-entry` (agrupada en el historial por entrada), `move-agenda-entry` (conserva la duración), `delete-agenda-entry` y `toggle-agenda-entry`, deshacibles. Borrar nodos quita sus ids de `nodeIds` (`removeNodes`). Importar fusionando añade las entradas que faltan.
- [x] Pruebas con Vitest (`agenda.test.ts`, 15): fechas, rangos, vencidas, menciones, fechas de las fichas, acciones, migración desde la v7, reparación, ida y vuelta por JSON y combinación de dos lados (cambios distintos de la misma entrada sin conflicto; la misma fecha cambiada distinto es conflicto y gana el grupo).

**Termina cuando:** el modelo, la migración y las acciones tienen pruebas y un proyecto antiguo carga igual que antes.

### Fase 3 — Vista «Calendario» (hecha el 2026-10-22)

Código en `src/components/calendar/` (`CalendarView`, `EntryPanel`, `agendaParts`, `agendaUi`), los miembros del grupo en `src/components/groups/useGroupMembers.ts` (desde la auditoría de duplicados del 2026-10-25, compartido con los comentarios del grupo) y `src/styles/calendar.css`.

- [x] Vista nueva en «Datos» (`View: 'calendar'`, atajo Alt+8, también en la paleta Ctrl+K y en el menú de vistas compactado), con tres modos: **Mes** (rejilla con hasta tres entradas por día y «+N»), **Semana** (por horas solo si hay horas; si no, por días) y **Lista** (próximas, por días, con las vencidas arriba).
- [x] Crear una entrada con doble clic en un día o con «Nueva», en un panel lateral como la ficha: tipo, título, fecha (o rango), hora opcional, descripción con menciones, nodos enlazados y «hecha».
- [x] Arrastrar una entrada a otro día para moverla (con deshacer), y marcar como hecha desde la propia rejilla.
- [x] Filtros por tipo de entrada y «ocultar hechas» (de cada navegador, en `preferences.agenda`). Hoy marcado; los días no laborables, más suaves. En la semana, las horas son filas (de la primera a la última usada) con cada entrada en la suya; sin horas, solo columnas por día.
- [x] Desde la cabecera, un enlace a «Configuración del calendario…».
- [x] Móvil (≤ 760 px): Lista por defecto, Mes compacto con puntos (un toque enseña el día) y la entrada a pantalla completa.

**Termina cuando:** se apuntan, mueven, completan y borran notas, tareas, entregas y eventos en Edge, a 390, 1440 y 3440 px, con deshacer, recarga y exportar/importar JSON.

Verificado el 2026-10-22 en Edge sin interfaz (perfil temporal, ejemplo «Caso Puerto Norte»): Alt+8, crear con el título enfocado, cambiar el tipo, mencionar, arrastrar al día siguiente, marcar como hecha, deshacer y rehacer, entrada con hora en la semana, lista, recarga, días laborables en la configuración, exportar `.ics`, la entrada en la ficha del nodo mencionado y crear otra desde ella, tarjeta de Salud, 1024, 1440, 3440 y 390 px sin desplazamiento horizontal y Lista por defecto en el móvil; sin errores JavaScript. Exportar e importar JSON, con prueba automática.

### Fase 4 — Integración con el resto del proyecto (hecha el 2026-10-22)

- [x] Fechas de las fichas en la agenda cuando el calendario es el real (`fieldDatesInRange`: gregoriano estándar y hoy real), de solo lectura, con enlace al nodo y el filtro «Fechas de las fichas» para ocultarlas.
- [x] La ficha del nodo enseña sus entradas (sección «Agenda» al final de «Conexiones», también si el nodo no tiene otras conexiones) y «Nueva entrada en la agenda» crea una ya enlazada y la abre.
- [x] Salud: tarjeta «Tareas y entregas vencidas» (solo si la agenda tiene tareas o entregas; no suma al recuento de avisos porque depende del día). Las menciones de la agenda cuentan como conexiones **en la ficha del nodo**; no entran en el grafo de los análisis (aislados, centralidad, comunidades), porque una entrada no es un nodo: un nodo solo mencionado en la agenda sigue saliendo como aislado.
- [x] Exportar: la agenda en el ZIP (`agenda/agenda.ics` y `agenda/agenda.csv`) y un `.ics` desde la cabecera de la vista, con o sin las fechas de las fichas (`src/services/agendaExport.ts`: VEVENT para todo, porque Google Calendar no lee VTODO; horas locales sin zona; líneas partidas a 75 octetos).
- [x] La IA (preguntas sobre el mundo) puede leer la agenda **solo con permiso, desactivado por defecto** (decisión del propietario del 2026-10-22). En el asistente, en modo pregunta y si el proyecto tiene agenda, «Incluir la agenda» se marca por proyecto y se guarda en este navegador (`preferences.aiAgendaProjects`). Con permiso, el contexto lleva `agenda: { today, entries }` (`worldContext(…, { includeAgenda })`): como mucho las 500 entradas más cercanas a hoy, en fechas reales, con la descripción recortada a 1000 caracteres y los nodos como n1, n2…. La API acepta el bloque opcional (`worldContextSchema`) y las instrucciones del modelo lo explican. La línea de privacidad del asistente dice cuántas entradas van, y la política de privacidad lo cuenta (22 de octubre de 2026).

### Fase 5 — Agenda en un grupo (hecha el 2026-10-22, falta el piloto)

- [x] Permisos por rol: las acciones de la agenda son datos (las bloquea quien no edita; el panel de la entrada queda de solo lectura con `useProjectAccess`) y la configuración sigue en `update-calendar`, de esquema. La combinación a tres bandas ya combina la agenda por `id` sin código propio (pruebas en `agenda.test.ts`).
- [x] Asignar una entrada a un miembro del grupo (`AgendaEntry.assignee`, identificador global de la cuenta; la lista sale de los miembros del espacio), con sus iniciales en la rejilla y el filtro «Solo lo asignado a mí».
- [x] Comentarios sobre una entrada, en su panel y en la pestaña «Comentarios» del grupo (con enlace a la entrada). Usan las rutas de comentarios existentes con el id de la entrada como destino (`nodeId`), así que **no cambia la API**. Sin sugerencias de valor: las sugerencias son de atributos de nodos; en una entrada basta con comentar.

**Termina cuando:** en el piloto del propietario dos cuentas comparten una agenda, se asignan tareas y los cambios llegan en tiempo real sin conflictos falsos.

### Opcional, más adelante

- Recordatorios (un aviso el día antes de una entrega). Necesitan que alguien avise sin la página abierta: no se implementa por cuenta propia; si se quiere, se pide a la plataforma.
- Importar un `.ics`.
- Categorías propias de entrada, entradas que se repiten (cada semana, cada mes) y festivos propios.
- En proyectos con calendario del mundo, un modo de la vista para ver por meses las fechas de las fichas con los meses del mundo (hoy eso es la Cronología, por años).

## Preguntas abiertas

Resueltas el 2026-10-22 con la opción recomendada, porque el propietario pidió implementar sin detenerse y revisarlo después. Si alguna no le convence, se cambia sobre la marcha.

1. ¿La agenda siempre en fechas reales, aunque el proyecto tenga calendario del mundo? **Sí**; las fechas del mundo siguen en la Cronología.
2. ¿«Calendario» como vista nueva junto a «Cronología», o las dos juntas en una vista con pestañas? **Separadas**: «Calendario» es otra vista de «Datos», con Alt+8.
3. ¿Bastan los cuatro tipos fijos (Nota, Tarea, Entrega, Evento) para empezar? **Sí.**
4. ¿Qué tipos de proyecto llevan el calendario del mundo arriba? **Novela o guion y Rol.** Investigación no; se añade con `worldCalendar: true` si hace falta.
5. ¿Los recordatorios quedan fuera por ahora? **Sí**, hasta tener la agenda en uso.

La de la fase 4 (¿la IA puede leer la agenda?) la decidió el propietario el 2026-10-22: sí, si se le da permiso; por defecto, no.

## Incidencias anotadas durante el roadmap

Cosas ajenas al calendario que el propietario detecta mientras este roadmap está activo. Se resuelven como arreglos acotados, sin abrir otro roadmap.

- [x] **El chat de grupo no mantiene abajo del todo el campo de escribir** (anotado y corregido el 2026-10-22). Causa: Nodaria le ponía `display: block` al elemento, que manda sobre el `:host { display: flex; flex-direction: column }` del SDK (comprobado en su código), así que el cuerpo de la conversación dejaba de crecer y el campo subía. Se quita el `display` en `groups.css` y solo se le da el alto (`flex: 1`). No hacía falta petición a la plataforma. Falta que el propietario lo vea con su cuenta: sin sesión no se abre el chat. Nota original: Si la conversación no llena el panel, el campo del mensaje sube hasta debajo de los últimos mensajes en vez de quedarse pegado al borde inferior. El chat es el elemento `<yosi-chat-conversacion>` del SDK de la plataforma incrustado en `GroupPanel.tsx`; Nodaria le da `flex: 1; min-height: 0` en `.group-chat-panel` (`src/styles/groups.css`) y el kit dice que el elemento ocupa el alto que le dé su contenedor (`ecosistema-kit/CHAT.md`). Comprobar primero si basta con una altura explícita en el elemento (`height: 100%`, o el contenedor como `display: flex` con el elemento estirado); si con la altura correcta la maquetación interna del SDK sigue sin fijar el campo abajo, no se arregla por cuenta propia: se envía una petición a la plataforma (`C:\Users\Yosi\Desktop\administracion yosiftware\docs\peticiones\`). Comprobar en Edge con una conversación nueva (sin mensajes) y con dos o tres mensajes, a 1440 px y a 390 px (donde el panel ocupa toda la vista).

## Criterios de finalización

- El engranaje dice «Configuración del calendario…» y su contenido se ordena según el tipo de proyecto, sin perder ningún calendario personalizado.
- Cada proyecto tiene una vista «Calendario» con notas, tareas, entregas y eventos, que se guarda, sincroniza, exporta e importa con el proyecto y respeta deshacer.
- En un grupo, la agenda respeta los roles y se combina sin perder entradas.
- Lint, build y pruebas correctos; flujos comprobados en Edge; `PROJECT_CONTEXT.md`, la guía de ayuda y, si cambia lo que sale del navegador, la política de privacidad, actualizados.
