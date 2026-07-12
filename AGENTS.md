## Instrucciones obligatorias

- Si es el primer mensaje de la conversacion o se perdio el contexto de `docs/codex/*`, antes de hacer nada hay que leer el contenido de `docs/codex/*`.
- Considera `docs/codex/*` como fuente de verdad para convenciones, arquitectura y flujo de trabajo.
- Si hay conflicto entre otras suposiciones y ese manual, manda el manual.
- No empieces cambios de codigo hasta tener esos datos en contexto.
- `docs/codex/PROJECT_WORKING_NOTES.md` establece exclusivamente como se espera que trabaje Codex: reglas operativas, convenciones, documentacion viva y verificacion.
- `docs/codex/PROJECT_CONTEXT.md` contiene el contexto vivo del proyecto: producto, arquitectura, modelo de dominio, estado técnico, decisiones y prioridades.
- Si se actualiza estado tecnico, arquitectura, decisiones de dominio, discrepancias o roadmaps, documentarlo en `PROJECT_CONTEXT.md` o en la vertical documental correspondiente, no en `PROJECT_WORKING_NOTES.md`.

## Resumen del producto

- Nodaria es una aplicación web generalista para visualizar árboles de nodos y relaciones transversales, como un mapa mental estructurado mediante esquemas configurables.
- Los usuarios pueden definir tipos de entidad y relación, atributos, herencia y restricciones, y después instanciar esos tipos en sus proyectos.
- El caso de uso de referencia es la planificación de una novela: representar personajes y sus relaciones para detectar huecos, redundancias y conexiones narrativas. Este caso orienta ejemplos y validación, pero el núcleo del producto debe seguir siendo generalista.
- Actualmente funciona como aplicación local con React, TypeScript y Vite, y guarda los proyectos en `localStorage` con importación y exportación JSON.
