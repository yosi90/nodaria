# Petición a Nodaria: dejar que el hook publique los avisos de Claude

Fecha: 2026-11-06
Solicitante: Notificapp, a petición del propietario
Afecta a: las instrucciones de Notificapp de vuestro `AGENTS.md` y vuestra copia de `plugin-kit/`

## Contexto

Desde la API 0.4.0 (5 de noviembre), Claude Code tiene en este equipo hooks propios de Notificapp: publican el final de cada turno y las preguntas de `AskUserQuestion` en una **conversación** de la APK, que el propietario puede contestar desde el móvil. La marca es `C:\Users\Yosi\.notificapp\claude-hook.json`. Con ella, **Claude no debe enviar avisos a mano**: el hook ya lo hace.

Un envío manual (`agent_notify.py` o `sender.py` con `--agent Claude`) no lleva sesión. No entra en ninguna conversación, duplica lo que publica el hook y queda como aviso suelto sin leer. Desde la APK 0.4.8, esos avisos aparecen en una tarjeta propia, «avisos sueltos», que se puede marcar como leída. Pero siguen siendo ruido.

Guía vigente: `C:\Users\Yosi\Desktop\notificapp\plugin-kit\AGENT_NOTIFICATIONS.md`, apartado «Claude Code: hooks con respuesta desde el móvil».

## Huecos concretos detectados

- `AGENTS.md`, «Vía agente», indica enviar a mano `--agent Claude --kind agent_finished|agent_question` con `notificapp/sender.py`. Ese cliente ya los omite en este equipo; basta con actualizar la instrucción.
- Vuestra copia de `plugin-kit/agent_notify.py` es anterior a la API 0.4.0 y **no conoce la marca** `~/.notificapp/claude-hook.json`: si la usáis con `--agent Claude`, el aviso sale aunque el hook ya haya publicado el turno.

## Qué necesitamos

1. **Kit al día.** Copiad de nuevo `plugin-kit/` desde `C:\Users\Yosi\Desktop\notificapp\plugin-kit\`. Está ignorado por Git. El `agent_notify.py` nuevo omite solo los envíos de Claude cuando existe la marca, y `--force` los permite si de verdad hiciera falta.
2. **`AGENTS.md`.** Sustituid la instrucción de envío manual de Claude por esta, o una equivalente:

   > **Claude Code** tiene hooks de Notificapp en este equipo (`~/.notificapp/claude-hook.json`): publican el final de cada turno y las preguntas de `AskUserQuestion`, y permiten contestarlos desde la APK. Claude no envía `agent_finished` ni `agent_question` a mano. Si falta la marca, mantiene el envío explícito. Una respuesta del móvil es un mensaje del propietario en esa sesión, no una aprobación de permisos.

   Para Codex no cambia nada: sigue con su `notify` de fin de turno y envía a mano sus preguntas (`agent_question`).
3. **Títulos.** Si queréis que el aviso de Claude diga algo concreto, ponedlo en la respuesta final. El hook usa «Claude ha finalizado en <proyecto>» o, con trabajo de fondo, «Claude sigue en segundo plano en <proyecto> · …».
4. **Resolución.** Dejadla en esta misma petición: qué cambió en `AGENTS.md` y la confirmación de que `python plugin-kit/agent_notify.py --agent Claude --kind agent_finished …` responde «No se envía: el hook de Claude de este equipo ya publica…» (pasad un cuerpo de prueba cualquiera; no llega a enviarse).

## Fuera de alcance

- Los avisos de proyecto (plugins) y los de Codex.
- Crear credenciales o emisores nuevos.

## Resolución

**Aceptada (2026-11-06).**

1. **Kit al día**: `plugin-kit/` copiado de nuevo desde `C:\Users\Yosi\Desktop\notificapp\plugin-kit\`. Sigue ignorado por Git.
2. **`AGENTS.md`**, «Vía agente»: se sustituye la instrucción de envío manual de Claude por la vuestra.
   - Los hooks de Claude Code (`~/.notificapp/claude-hook.json`) publican el final de cada turno y las preguntas de `AskUserQuestion`, y se contestan desde la APK. Claude no envía `agent_finished` ni `agent_question` a mano; si falta la marca, mantiene el envío con `agent_notify.py`. Una respuesta del móvil no es una aprobación de permisos.
   - Codex sigue con su `notify` y envía a mano sus preguntas con `--agent Codex`.
3. **Títulos**: sin cambios. Se usa el título del hook.
4. **Comprobación**: `python plugin-kit/agent_notify.py --agent Claude --kind agent_finished --title prueba --body-file <cuerpo de prueba>` responde «No se envía: el hook de Claude de este equipo ya publica sus respuestas y preguntas (y permite contestarlas desde el móvil).» y sale con 0.

