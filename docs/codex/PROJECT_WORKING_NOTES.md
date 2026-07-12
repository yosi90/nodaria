# Project Working Notes

## Objetivo

Instrucciones operativas para futuras sesiones de Codex en este repositorio.

Este archivo describe cómo se espera que Codex trabaje. El contexto del producto, la arquitectura vigente, las decisiones de dominio y los roadmaps viven en `docs/codex/PROJECT_CONTEXT.md`.

## Reglas de trabajo

- Antes de tocar código, leer `docs/codex/PROJECT_WORKING_NOTES.md`, `docs/codex/PROJECT_CONTEXT.md` y revisar la zona afectada del repositorio.
- Contrastar cada petición con el modelo y la arquitectura reales antes de implementarla. Si una propuesta introduce riesgos innecesarios o existe una alternativa claramente mejor, explicarlo y proponer la alternativa.
- Mantener los cambios acotados al problema pedido. No hacer refactors amplios ni reordenamientos masivos si no son necesarios.
- No revertir cambios ajenos o no solicitados. Si el árbol de Git está sucio, trabajar alrededor de esos cambios y tocar solo lo necesario.
- Mantener separadas las responsabilidades de dominio, persistencia, estado e interfaz. Evitar que los componentes visuales acumulen reglas de negocio o acceso directo al almacenamiento.
- Favorecer tipos explícitos y funciones de dominio reutilizables frente a duplicar lógica dentro de componentes.
- Preservar los datos locales y el formato de importación/exportación cuando sea razonable. Si una ruptura de compatibilidad aporta una mejora importante, documentar el motivo y definir una migración.
- No añadir dependencias sin una necesidad concreta. Cuando se añada una, fijar una versión compatible y actualizar la documentación pertinente.

## Convenciones de edición

- El código de dominio y sus tipos viven en `src/domain/`.
- La persistencia, importación, exportación y futuras integraciones externas viven en `src/services/`.
- El estado compartido y sus acciones viven en `src/state/`.
- Los componentes se organizan por área funcional dentro de `src/components/`; los elementos reutilizables viven en `src/components/common/`.
- Los estilos globales viven en `src/styles/`. Cuando una zona crezca lo suficiente, dividir sus estilos por funcionalidad en lugar de ampliar indefinidamente un único archivo.
- Mantener TypeScript en modo estricto. No introducir `any` para evitar modelar un dato salvo que exista una razón documentada.
- Las reglas que determinan herencia, compatibilidad entre tipos, relaciones, descendencia o valores calculados deben implementarse como lógica de dominio comprobable, no como condiciones dispersas en la UI.
- Los textos visibles de la aplicación están en español mientras no se adopte un sistema de internacionalización.

## Documentación viva y roadmaps

- Mantener `docs/codex/PROJECT_CONTEXT.md` actualizado cuando cambien la arquitectura, el modelo de dominio, el estado técnico, las decisiones relevantes o las prioridades del producto.
- Los detalles operativos estables pertenecen a este archivo; el estado cambiante del proyecto pertenece a `PROJECT_CONTEXT.md`.
- Para cambios pequeños o bugs aislados basta con actualizar la documentación existente que corresponda.
- Crear `docs/roadmaps/` únicamente cuando una iniciativa abarque varias sesiones, afecte a distintas áreas o necesite una checklist propia.
- Todo roadmap debe indicar objetivo, alcance, decisiones, fases, estado y criterios de finalización.
- Solo debe existir un roadmap activo principal a la vez. Durante su ejecución, mantener su checklist sincronizada con el estado real.
- Al terminar un cambio, actualizar la documentación afectada después de pasar las verificaciones razonables.

## Verificación

- Antes de cambiar comportamiento, revisar los scripts disponibles en `package.json` y buscar pruebas relacionadas con la zona afectada.
- Como mínimo, ejecutar `npm run lint` y `npm run build` después de cambios de código, salvo que el entorno lo impida.
- Priorizar verificaciones automatizables: pruebas unitarias, compilación, lint, comprobación del servidor local y validación de importación/exportación.
- Para reglas de dominio nuevas o correcciones delicadas, añadir pruebas automatizadas cuando exista infraestructura para ello; si todavía no existe, valorar introducirla como parte del cambio.
- Para cambios visuales o de interacción, comprobar el flujo en navegador cuando las herramientas disponibles lo permitan.
- No afirmar que una interacción funciona si solo se ha comprobado que compila. Indicar con claridad qué verificaciones se realizaron y cuáles quedaron pendientes.
