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
- [x] Copias automáticas periódicas en el navegador (instantáneas por proyecto) y restauración desde una lista. Hecho el 2026-10-17: al guardar, la versión anterior de cada proyecto que cambia se aparta en IndexedDB (`backups`, clave `snapshot:<proyecto>:<fecha>`) la primera vez en la sesión y después como mucho cada 30 minutos; se conservan las 12 últimas por proyecto y ninguna de más de 30 días (`snapshotsToPrune`). Menú de proyectos → «Copias de seguridad…» (`SnapshotsDialog`): por proyecto, también los borrados, y se restauran como proyecto nuevo. Sin IndexedDB no hay copias. Original: Las copias diarias de la base del servidor solo cubren a quien tiene cuenta y no se pueden restaurar desde la app.
- [ ] Guardar en un archivo o carpeta del disco (File System Access API). **Candidato a descartar:** la sincronización con cuenta ya cubre el cambio de equipo, y la API solo existe en Chromium.
- [x] Exportar a Markdown compatible con Obsidian (una nota por nodo con enlaces `[[ ]]`), a CSV por tipo y a un ZIP con imágenes. Hecho el 2026-10-17: engranaje → «Exportar ZIP (notas Markdown, CSV e imágenes)» (`src/services/exportBundle.ts`, ZIP sin compresión propio en `src/services/zip.ts`, sin dependencias): el JSON del proyecto, un CSV por tipo (y `relaciones.csv`) separados por «;» con BOM para Excel en español, una nota por nodo con los atributos en el encabezado YAML, sus notas, relaciones y subnodos como enlaces `[[ ]]`, y las imágenes (también la del mapa) como archivos. Comprobado abriéndolo con el descompresor de Windows.
- [x] Importar desde CSV para crear muchos nodos de golpe, con correspondencia de columnas a atributos. Hecho el 2026-10-17: selector de proyecto → «Importar nodos desde CSV…» (`src/domain/csvImport.ts`, `src/components/layout/CsvImportDialog.tsx`). Lee «;» o «,» (el que más aparezca en la cabecera), comillas y BOM; cada fila es un nodo del tipo elegido (se propone el que da nombre al archivo) y cada columna va al título, a «Dentro de» (por título, entre los nodos existentes y los importados, si el tipo superior lo admite), a las notas, a un atributo (con las conversiones desde texto de `valueConversion.ts`) o a ninguna parte; la correspondencia se propone por el nombre de la columna. Avisa de los valores que no encajan y de las filas que irán a la raíz, y se deshace en un paso. Lee los CSV que exporta el ZIP (comprobado con un test de ida y vuelta).
- [x] Importar con vista previa y con opción de fusionar en el proyecto actual. Hecho el 2026-10-17: «Importar JSON…» abre `ImportProjectDialog` con el resumen del archivo y dos destinos, proyecto nuevo (como antes) o fusionar en el actual (`src/domain/projectMerge.ts`). La fusión añade por id lo que falta: con la casilla de esquema, tipos, atributos nuevos de tipos que ya están, atributos compartidos, parentescos y carpetas de tipos (acción `merge-project`, de esquema en los grupos); siempre, nodos, relaciones, carpetas, vistas y consultas (`merge-project-data` si el rol no deja tocar el esquema). Lo que ya está se conserva, así que reimportar el mismo archivo no duplica; avisa de los nodos con el mismo título que uno existente y de lo que se omite por faltar su tipo, y se deshace en un paso.
- [ ] PWA instalable y con funcionamiento sin conexión (manifiesto y service worker; la sincronización ya reintenta al recuperar la conexión).

## 3. Cabos sueltos del modelo

- [x] **Renombrar la clave o la etiqueta de un atributo rompe las fórmulas que lo usan.** Hecho el 2026-10-17 (`src/domain/formulaRenames.ts`): al guardar un tipo o una preforma con un atributo renombrado, se reescriben las fórmulas que lo citan, resolviendo cada nombre como la evaluación (atributo propio, a través de referencias o de «padre», argumentos de funciones y `contar`/`lista`) con los nombres de antes, así que otro atributo que se llame igual en otro tipo no se toca; también las preformas calculadas y las fórmulas `{clave}` de las relaciones. Salud tiene «Fórmulas con problemas» (`formulaIssues`) para lo que no se pueda reescribir. Original: `formulas.ts` lo busca por clave o etiqueta y nada reescribe las expresiones. Hay que reescribir las fórmulas del proyecto, incluidas las de las preformas, al renombrar, o al menos avisar en Salud de las fórmulas con nombres que no se encuentran.
- [x] **Cambiar el tipo de un atributo no convierte los valores guardados.** Hecho el 2026-10-17 (`src/domain/valueConversion.ts`): al guardar el tipo nuevo se convierte lo convertible (texto, números con coma, sí/no, fechas `AAAA-MM-DD`, etiquetas separadas por comas, referencias por el título del nodo, color, género, escala) y se borra lo demás, en el mismo paso deshacible. Al pasar a lista se añaden como opciones los valores que falten (hasta 50). El editor avisa antes de cuántos valores se perderían y pide confirmación (`conversionPreview`). Original: Por ejemplo, de texto a número o de lista a etiquetas: el valor anterior se queda con su forma vieja. Hay que convertir lo convertible y avisar de lo que se pierde, con un paso que se pueda deshacer.
- [ ] Tipo de atributo **lista ordenada**, que aparece en la Fase 4 como pendiente.

## 4. Vistas y lienzo

- [ ] **Línea temporal** (Fase 5): acontecimientos y nodos con fechas sobre el calendario del mundo (`src/domain/calendar.ts`, ya hecho). Quedaron fuera del calendario las eras, los años negativos y un aviso en Salud de las fechas escritas fuera del calendario.
- [x] Filtro por etiquetas en la leyenda del mapa. Hecho el 2026-10-17: sección «Etiquetas» de la leyenda con las del proyecto y cuántos nodos las llevan (`src/domain/tagFilter.ts`); con alguna marcada, el lienzo solo muestra los nodos que llevan al menos una en cualquier atributo «Etiquetas», y «Ver todos» lo quita. Se guarda en la vista (`view.tagFilter`, vacío por defecto y en los proyectos anteriores) y, por tanto, en las vistas guardadas.
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
