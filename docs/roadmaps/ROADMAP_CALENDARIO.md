# Calendario del proyecto y configuración del calendario

Fecha: 2026-10-19. Estado: **roadmap activo principal desde el 2026-10-19**, sin empezar. El propietario lo activa al cerrarse [`ROADMAP_COLABORACION.md`](ROADMAP_COLABORACION.md). La fase 1 solo depende de la pregunta 4; las fases 2 y siguientes, del resto. Las decisiones marcadas como «propuesta» esperan su confirmación (ver «Preguntas abiertas»).

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

### Fase 1 — Nombre y configuración por partes

- [ ] Engranaje → «Configuración del calendario…»; título del diálogo igual. Revisar los textos que dicen «calendario del proyecto» o «del mundo» (Cronología, guía de fórmulas, `FieldControl`, la ayuda) para que digan lo correcto según el tipo de proyecto.
- [ ] `CalendarDialog` por secciones:
  - Novela y rol: **«Calendario del mundo»** arriba, destacado (tarjeta con acento y una línea que explica para qué sirve: edades, días entre fechas, Cronología), y debajo los ajustes normales.
  - Resto: ajustes normales arriba y, abajo del todo, **«Calendario personalizado (avanzado)»** plegado, con «Meses, días de la semana y fecha fija, para proyectos con un calendario inventado». Desplegado y con aviso si ya no es el gregoriano.
- [ ] Mantener «Volver al calendario gregoriano», el aviso de fechas fuera de rango y la edición en vivo deshacible.

**Termina cuando:** en un proyecto General no se ve a primera vista nada de meses inventados; en uno de Novela o Rol es lo primero que aparece; nadie pierde su calendario personalizado.

### Fase 2 — Modelo de la agenda (dominio)

- [ ] `src/domain/agenda.ts`: `AgendaEntry { id, kind: 'note' | 'task' | 'deadline' | 'event', title, date (AAAA-MM-DD real), endDate?, time?, description (con menciones), done, nodeIds, createdAt, updatedAt }`. Funciones puras: entradas de un día, de un rango y de un nodo, vencidas (tareas y entregas sin hacer con fecha pasada) y próximas.
- [ ] `Project.calendar.settings`: primer día de la semana (lunes por defecto), días laborables (lunes a viernes), números de semana y vista inicial (mes, semana o lista).
- [ ] Migración a la versión 8 (`migrations.ts`) y normalización: entradas sin título, fechas imposibles o nodos que ya no existen se reparan al cargar e importar, como el resto.
- [ ] Acciones `add-agenda-entry`, `update-agenda-entry` (agrupada en el historial como las ediciones de nodos), `delete-agenda-entry` y `toggle-agenda-entry`, deshacibles. Borrar nodos quita sus ids de `nodeIds`.
- [ ] Pruebas con Vitest: rangos, vencidas, migración, reparación y combinación de dos lados que cambian entradas distintas o la misma.

**Termina cuando:** el modelo, la migración y las acciones tienen pruebas y un proyecto antiguo carga igual que antes.

### Fase 3 — Vista «Calendario»

- [ ] Vista nueva en «Datos» (`View: 'calendar'`, atajo Alt+8, también en la paleta Ctrl+K y en el menú de vistas compactado), con tres modos: **Mes** (rejilla con hasta tres entradas por día y «+N»), **Semana** (por horas solo si hay horas; si no, por días) y **Lista** (próximas, por días, con las vencidas arriba).
- [ ] Crear una entrada con doble clic en un día o con «Nueva», en un panel lateral como la ficha: tipo, título, fecha (o rango), hora opcional, descripción con menciones, nodos enlazados y «hecha».
- [ ] Arrastrar una entrada a otro día para moverla (con deshacer), y marcar como hecha desde la propia rejilla.
- [ ] Filtros por tipo de entrada y «ocultar hechas». Hoy marcado; los días no laborables, más suaves.
- [ ] Desde la cabecera, un enlace a «Configuración del calendario…».
- [ ] Móvil (≤ 760 px): Lista por defecto y Mes compacto.

**Termina cuando:** se apuntan, mueven, completan y borran notas, tareas, entregas y eventos en Edge, a 390, 1440 y 3440 px, con deshacer, recarga y exportar/importar JSON.

### Fase 4 — Integración con el resto del proyecto

- [ ] Fechas de las fichas en la agenda cuando el calendario es el real (de solo lectura, con enlace al nodo), con un interruptor para ocultarlas.
- [ ] La ficha del nodo enseña sus entradas («Conexiones» o una sección propia) y permite crear una ya enlazada.
- [ ] Salud: tarjeta «Tareas y entregas vencidas». Las menciones de la agenda cuentan como conexiones, igual que las de las notas.
- [ ] Exportar: la agenda en el ZIP y un `.ics` para abrirla en Google Calendar, Outlook o el móvil (solo exportar; las fechas de las fichas, opcionales).
- [ ] La IA (preguntas sobre el mundo) puede leer la agenda si el propietario lo quiere: decidirlo antes, porque cambia lo que sale del navegador y la política de privacidad.

### Fase 5 — Agenda en un grupo

- [ ] Permisos por rol (las acciones nuevas son datos; la configuración, esquema) y comprobación de la combinación con dos personas que editan a la vez.
- [ ] Asignar una tarea o entrega a un miembro del grupo y filtrar «lo mío».
- [ ] Comentarios y sugerencias sobre una entrada, con el panel de comentarios del grupo.

**Termina cuando:** en el piloto del propietario dos cuentas comparten una agenda, se asignan tareas y los cambios llegan en tiempo real sin conflictos falsos.

### Opcional, más adelante

- Recordatorios (un aviso el día antes de una entrega). Necesitan que alguien avise sin la página abierta: no se implementa por cuenta propia; si se quiere, se pide a la plataforma.
- Importar un `.ics`.
- Categorías propias de entrada, entradas que se repiten (cada semana, cada mes) y festivos propios.
- En proyectos con calendario del mundo, un modo de la vista para ver por meses las fechas de las fichas con los meses del mundo (hoy eso es la Cronología, por años).

## Preguntas abiertas

1. ¿La agenda siempre en fechas reales, aunque el proyecto tenga calendario del mundo? (Recomendado: sí; las fechas del mundo siguen en la Cronología.)
2. ¿«Calendario» como vista nueva junto a «Cronología», o las dos juntas en una vista con pestañas? (Recomendado: separadas; la Cronología es la historia del proyecto por años y la agenda, el trabajo día a día.)
3. ¿Bastan los cuatro tipos fijos (Nota, Tarea, Entrega, Evento) para empezar? (Recomendado: sí.)
4. ¿Qué tipos de proyecto llevan el calendario del mundo arriba? (Propuesta: Novela o guion y Rol. ¿También Investigación, por si es histórica?)
5. ¿Los recordatorios quedan fuera por ahora? (Recomendado: sí, hasta tener la agenda en uso.)

## Criterios de finalización

- El engranaje dice «Configuración del calendario…» y su contenido se ordena según el tipo de proyecto, sin perder ningún calendario personalizado.
- Cada proyecto tiene una vista «Calendario» con notas, tareas, entregas y eventos, que se guarda, sincroniza, exporta e importa con el proyecto y respeta deshacer.
- En un grupo, la agenda respeta los roles y se combina sin perder entradas.
- Lint, build y pruebas correctos; flujos comprobados en Edge; `PROJECT_CONTEXT.md`, la guía de ayuda y, si cambia lo que sale del navegador, la política de privacidad, actualizados.
