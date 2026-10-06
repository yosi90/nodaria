# Pendientes de Nodaria

> Lista consolidada el 2026-10-06 de todo lo que queda por hacer, sacada de `ROADMAP_RENOVACION.md` (activo) y `ROADMAP_BACKEND.md` (cerrado) y contrastada con el código.
> No es un roadmap aparte: es el inventario de lo que falta para cerrar el activo. Al terminar algo, marcarlo aquí y en el roadmap de origen.

## Orden de trabajo

1. ~~Protección de los datos locales (sección 1)~~: hecha el 2026-10-06.
2. Resto de la Fase 7 (sección 2); IndexedDB ya está hecho (2026-10-06).
3. Cabos sueltos del modelo (sección 3).
4. Línea temporal y mejoras de vistas (sección 4).
5. Asistente IA (sección 5), opcional.

Para cerrar `ROADMAP_RENOVACION.md` hacen falta las secciones 1 y 2 completadas o descartadas por escrito, la línea temporal hecha o descartada y el mundo real del libro modelado en la app (lo comprueba el propietario).

## 1. Protección de los datos locales (hecha el 2026-10-06)

- [x] **Aviso cuando falla el guardado.** `saveState` (`src/services/storage.ts`) llama a `localStorage.setItem` sin capturar el error. El límite ronda los 5 MB para todos los proyectos juntos, y las imágenes van dentro del proyecto (retratos de 384 px de unos 20–40 KB, mapa de hasta 2400 px). Si se llena, la excepción salta dentro de un temporizador, nadie se entera y lo editado desde entonces se pierde al recargar si no hay cuenta. Hay que capturar el error, avisar de forma visible y persistente y ofrecer exportar.
- [x] **Una carga fallida no debe borrar nada.** Si `loadState` lanza una excepción (JSON dañado o un fallo al migrar o reparar un solo proyecto), devuelve un estado en blanco. El guardado con retardo lo escribe encima de los datos 400 ms después y, con sesión iniciada, `planSync` ve que faltan en local proyectos que recuerda sincronizados y los borra de la cuenta (borrado lógico, recuperable solo desde la base). Hay que:
  - aislar cada proyecto: si uno falla, cargar los demás y avisar;
  - guardar el texto original en una copia de rescate antes de escribir nada;
  - no dejar que la sincronización borre en remoto por una carga fallida.

Resuelto así: `parseState` prepara cada proyecto por separado; si alguno falla, `loadState` aparta el texto original en `nodaria_rescue_v1:<fecha>` y, si no cabe, `AppContext` pausa el guardado hasta que el usuario lo descarga o renuncia a él. Tras una carga con pérdidas, la primera sincronización recupera de la cuenta los proyectos que faltan (`planSync` con `recoverMissing`). Un guardado fallido se avisa con el motivo, una exportación del proyecto y «Reintentar» (`StorageNotice`).

## 2. Fase 7: persistencia, copias y exportación

- [x] **IndexedDB** como almacenamiento principal (2026-10-06): un registro por proyecto y cada guardado escribe solo lo que cambió; migración automática desde `localStorage` conservando el original como copia; fusión de lo que escriban pestañas abiertas con la versión anterior; pantalla de error en vez de arrancar en blanco si la base no se puede abrir. Pendiente de decidir: pedir `navigator.storage.persist()` (Firefox lo pregunta con un diálogo) y qué hacer con proyectos de más de 20 MiB, que se guardan en local pero la API no acepta.
- [x] Almacenamiento de imágenes (2026-10-06, cerrado con IndexedDB): el redimensionado al subir ya existe (retratos y mapa). Con IndexedDB, el resto del punto se puede dar por cerrado o replantearse como imágenes fuera del documento del proyecto, lo que afectaría a la API: hoy sube el documento entero con un máximo de 20 MiB.
- [ ] Copias automáticas periódicas en el navegador (instantáneas por proyecto) y restauración desde una lista. Las copias diarias de la base del servidor solo cubren a quien tiene cuenta y no se pueden restaurar desde la app.
- [ ] Guardar en un archivo o carpeta del disco (File System Access API). **Candidato a descartar:** la sincronización con cuenta ya cubre el cambio de equipo, y la API solo existe en Chromium.
- [ ] Exportar a Markdown compatible con Obsidian (una nota por nodo con enlaces `[[ ]]`), a CSV por tipo y a un ZIP con imágenes.
- [ ] Importar desde CSV para crear muchos nodos de golpe, con correspondencia de columnas a atributos.
- [ ] Importar con vista previa y con opción de fusionar en el proyecto actual. Hoy importar siempre crea un proyecto nuevo; `mergeTemplate` ya fusiona tipos y puede servir de base.
- [ ] PWA instalable y con funcionamiento sin conexión (manifiesto y service worker; la sincronización ya reintenta al recuperar la conexión).

## 3. Cabos sueltos del modelo

- [ ] **Renombrar la clave o la etiqueta de un atributo rompe las fórmulas que lo usan.** `formulas.ts` lo busca por clave o etiqueta y nada reescribe las expresiones. Hay que reescribir las fórmulas del proyecto, incluidas las de las preformas, al renombrar, o al menos avisar en Salud de las fórmulas con nombres que no se encuentran.
- [ ] **Cambiar el tipo de un atributo no convierte los valores guardados.** Por ejemplo, de texto a número o de lista a etiquetas: el valor anterior se queda con su forma vieja. Hay que convertir lo convertible y avisar de lo que se pierde, con un paso que se pueda deshacer.
- [ ] Tipo de atributo **lista ordenada**, que aparece en la Fase 4 como pendiente.

## 4. Vistas y lienzo

- [ ] **Línea temporal** (Fase 5): acontecimientos y nodos con fechas sobre el calendario del mundo (`src/domain/calendar.ts`, ya hecho). Quedaron fuera del calendario las eras, los años negativos y un aviso en Salud de las fechas escritas fuera del calendario.
- [ ] Filtro por etiquetas en la leyenda del mapa. Se aplazó en la Fase 2 «hasta que existan etiquetas»; el atributo «Etiquetas» ya existe.
- [ ] Selección múltiple en el lienzo. Se aplazó en la Fase 2; la Tabla ya tiene operaciones masivas, que podrían reutilizarse.
- [ ] Rendimiento en mapas grandes (prioridad conocida en `PROJECT_CONTEXT.md`). Medición de la Fase 2 con 500 nodos y 1500 relaciones: jerárquica 1,3 s, fuerzas 2,5 s y resaltado 0,22 s.

## 5. Asistente IA (Fase 8, opcional)

No hace falta para cerrar el roadmap. Todo debe poder desactivarse y nada debe cambiar datos sin confirmación.

- [ ] Configuración con clave de API propia guardada solo en local y aviso claro de qué datos se envían.
- [ ] Preguntas en lenguaje natural sobre el mundo.
- [ ] Sugerencias de relaciones o atributos que faltan, como propuestas que se aceptan o descartan.
- [ ] Detección de incoherencias entre las notas y los datos estructurados.
- [ ] Resúmenes de un nodo, de un grupo o de una vista guardada.

## Aplazado o descartado (no bloquea el cierre)

- Vista «Ficha completa» a pantalla entera: pospuesta, porque el inspector ensanchado cubre el uso actual.
- Agrupar los hijos dentro del padre en el lienzo (contenedores plegables): descartado, porque las estructuras alternativas lo cubren mejor.
- Etiquetas libres por nodo: resuelto con el tipo de atributo «Etiquetas».
- Mensajes de usuarios y plugin de Notificapp (fases 3 y 7 de `ROADMAP_BACKEND.md`): aplazados por decisión del propietario hasta que la web monte peticiones. Las tablas `messages` y `notificapp_outbox` ya existen.
- Fuera de alcance: colaboración en tiempo real, compartir proyectos entre cuentas y aplicación móvil nativa.
