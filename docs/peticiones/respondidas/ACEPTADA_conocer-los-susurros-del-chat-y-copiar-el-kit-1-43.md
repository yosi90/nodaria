# Petición a Nodaria: conocer los susurros del chat y copiar el kit 1.43

Fecha: 2026-10-18
Solicitante: plataforma Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`), a petición del propietario.
Afecta a: el chat de los grupos (`src/components/groups/GroupPanel.tsx`, que incrusta `<yosi-chat-conversacion>`).

## Contexto

El chat de la plataforma tiene desde hoy **susurros**, a petición de Fichas: mensajes que se ven en la conversación como cualquier otro y cuentan como no leídos, pero **no mandan push**. Así se puede comentar algo en un grupo sin hacer vibrar el móvil de todos. Están en QA y en producción desde el 18 de octubre de 2026, con el SDK 1.19 y el kit 1.43.

- **Quien escribe lo elige en cada mensaje:** la flecha pegada a «Enviar» abre ahora un menú con «Susurrar» y «Programar…». Al programar hay un interruptor «Susurro».
- **Los susurros llevan una marca**, una campana tachada junto a la hora, también en la franja de los programados.
- **Vale en todo el chat**, también en las conversaciones de los espacios, como la de vuestros grupos.

Lo hemos contrastado con vuestro código, en solo lectura:

- Incrustáis `<yosi-chat-conversacion>` del SDK y le dais vuestros colores con las variables `--yosi-color-*` (`src/styles/groups.css`). El menú y la marca nuevos usan esas mismas variables, así que salen con vuestros colores sin tocar nada.
- No restiláis las piezas de la conversación con `::part()`, así que los nombres nuevos no os afectan.
- No usáis las rutas del chat ni `chat.mensaje` desde un frontend propio.

## Qué necesitamos

1. **Saberlo:** vuestros grupos ya tienen los susurros con el SDK de la plataforma. No hay que cambiar código.
2. **Copiar el kit 1.43** en lugar del 1.39 que pedía `limitar-el-nombre-de-los-grupos-y-copiar-el-kit-1-39.md` (esa petición sigue abierta por el límite del nombre). La novedad está en `ecosistema-kit/CHAT.md`, «Los susurros». Lo de las versiones 1.40 a 1.42 (la lista de acceso y la librería de las apps Android) no os pide nada.
3. **Si algún día montáis vuestro propio chat** sobre `/v1/chat/…`: mandad `"susurro": true` para susurrar y marcad los mensajes que lleguen con `susurro: true`. El push lo decide la plataforma.
4. **Si restiláis la conversación con `::part()`**, los nombres nuevos son `panel envio`, `fila susurrar`, `insignia susurro`, `fila susurro` e `interruptor susurro` (`ecosistema-kit/ESTILOS.md`).

## Comprobaciones previas

- Leídos, en solo lectura, `src/components/groups/GroupPanel.tsx` y `src/styles/groups.css` (2026-10-18).
- Probado en la plataforma: Vitest del SDK, Edge con el susurro de punta a punta y capturas en claro, oscuro, escritorio y móvil; en QA, por la API pública, el susurro no genera push y el mensaje normal sí.
- El contrato: `docs/publica/ENDPOINTS.md`, «Los susurros»; `docs/publica/CHAT.md`; `docs/publica/asyncapi.yaml` (`chat.mensaje`).

## Calendario y dependencias

Sin calendario: ya funciona en producción.

## Fuera de alcance

- Cambiar vuestro código.

## Resolución

**Aceptada y hecha** (2026-10-18), sin cambios de código.

1. **Enterados:** el chat del grupo (`GroupChatPanel` en `src/components/groups/GroupPanel.tsx`) incrusta `<yosi-chat-conversacion>` y ya ofrece los susurros con el SDK de la plataforma. Comprobado de nuevo: sin `::part()`, sin `/v1/chat/…` ni `chat.mensaje` propios; los colores salen de las variables `--yosi-color-*` de `src/styles/groups.css`.
2. **Kit 1.43** copiado en `ecosistema-kit/` (ignorado por Git) y anotado en `docs/codex/PROJECT_CONTEXT.md` y en `docs/roadmaps/ROADMAP_COLABORACION.md` («Kit 1.43: susurros en el chat»). La petición del kit 1.39 ya estaba resuelta el 2026-10-17 (nombre hasta 150 caracteres, en producción).
3. y 4. **Frontend propio y `::part()`:** anotados en el roadmap para cuando se monten (`"susurro": true`, marca de `susurro: true` y los nombres nuevos de las piezas).
