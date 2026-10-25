# Petición a las webs y apps del ecosistema: usar el proveedor de IA preferido de cada persona (kit 1.54)

Fecha: 2026-10-24
Solicitante: plataforma común de Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`), a petición del propietario
Destinatarios: Fichas 3.5 (web, backend y 3.5 Companion), Nodaria, Lorcana (web y Yosircana), Poke-Voice, Re-Notas, Libros (API y frontend), Hotrods y el Hall. p.i.c. lo recibe en su roadmap de adhesión.
Afecta a: qué proveedor de IA usa cada web por la persona, y qué modelo le propone por defecto.

> Sustituye a `usar-anthropic-primero-para-el-texto-kit-1-54.md`, entregada el mismo día y retirada: imponía a todo el mundo un orden que es solo el del propietario.

## Contexto

Desde el kit 1.54, **cada persona elige en «Claves de IA» de la web social el proveedor que prefiere para cada uso**: texto, imágenes, voz y transcripción. Tu web lo lee en `GET /v1/ia/estado`, que ya usas para saber si hay clave, en el campo nuevo `preferidos`:

```json
"preferidos": { "texto": "anthropic", "imagen": "openai", "voz": "elevenlabs", "transcripcion": null }
```

`null` es que no ha elegido. Ese ejemplo es el del propietario, que prefiere Anthropic para el texto con su clave nueva, que se recarga cada mes. Cualquier otra persona tendrá el suyo.

El detalle está en `ecosistema-kit/CLAVES_DE_IA.md`, «El proveedor preferido de la persona», y en un punto nuevo de `LISTA_DE_COMPROBACION.md`, «Claves de IA». Es un cambio compatible: si no hacéis nada, todo sigue funcionando como hoy.

## Qué necesitamos

1. **Copiad el kit 1.54** desde `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\`.
2. **Si vuestra web elige el proveedor por la persona**, que empiece por su preferido para ese uso cuando esté `lista`. Si no lo está, podéis usar otro que lo esté, diciéndoselo. Sin preferencia, decidís vosotros, como ahora.
3. **Si deja elegir el modelo**, que el elegido por defecto sea uno de su proveedor preferido cuando esté `lista`. La persona puede escoger otro.
4. **Tras un error de la llamada**, no cambiéis de proveedor a sus espaldas: decídselo y, si queréis, ofrecedle otro.
5. **Responded en vuestra copia** con lo que hayáis hecho o comprobado.

## Lo que hemos visto en vuestro código (solo lectura, 2026-10-24)

| Proyecto | Qué usa | Qué cambia |
| --- | --- | --- |
| Fichas 3.5 | Ideas de IA (texto), voces e imágenes de personajes | Las ideas prueban hoy Anthropic y después OpenAI (`ORDEN_SIN_PROVEEDOR` en `ideas_ia_controller.py`). La voz prueba ElevenLabs primero. Que las dos empiecen por el preferido, y que el menú de modelos (`modelo-ia-menu.component.ts`) proponga uno de él. |
| Nodaria | El asistente (texto), con tres modelos de cada proveedor | Que el modelo elegido por defecto sea el equilibrado del proveedor preferido, también con la clave del grupo. |
| Re-Notas | Transcripción y análisis (texto) | El análisis elige hoy Anthropic si está `lista` (`CuentaDeYosiftware.kt`): que empiece por el preferido. La transcripción, igual, con su preferido entre OpenAI y ElevenLabs. |
| Poke-Voice | Transcripción (OpenAI y ElevenLabs) | Que empiece por el preferido para la transcripción. |
| Lorcana, Libros, Hotrods y el Hall | No usan la pasarela hoy | Nada. Queda en la lista de comprobación para cuando la usen. |

## Además, en el kit 1.54

- **Editar imágenes**: `v1/images/edits` de OpenAI pasa por la pasarela, en multipart (para p.i.c.). Los modelos de imagen llevan en su `precio` el de la imagen que se manda (`entradaImagen`), y `gpt-image-2.5-sunburst` y `-flare` están en la tabla. Si Fichas genera imágenes de personajes con una imagen de referencia, su coste ya se cuenta bien.

## Comprobaciones previas

- Probado en desarrollo: la preferencia se guarda desde la web social y otra web la lee en `GET /v1/ia/estado` (prueba de Edge `webs/pruebas/e2e/ia.spec.ts` y pruebas de la API).
- La pasarela no aplica la preferencia: llama al proveedor que pide cada web. Por eso lo tiene que aplicar cada web.
- **En QA y en producción desde el 2026-10-24** (`2000888`), comprobado desde fuera. El propietario ya tiene puestos sus preferidos en producción: texto `anthropic`, imagen `openai` y voz `elevenlabs`.

## Calendario y dependencias

Sin fecha ni bloqueo. Cada proyecto, cuando le toque.

## Fuera de alcance

- Cambiar de proveedor por precio o por calidad en cada llamada.
- Las claves y sus topes: siguen igual.

## Resolución

### Respuesta de Nodaria (2026-10-25)

**Aceptada y hecha, en producción el 2026-10-25** (commit `2bf37ba`, bundle `main-CooG1mWZ.js`). Se usa el kit 1.58, que incluye el 1.54.

1. **Kit:** 1.58 copiado en `ecosistema-kit/`.
2. **Proveedor:** Nodaria no elige el proveedor por la persona. Lo fija el modelo que ella escoge en el asistente.
3. **Modelo por defecto:** el asistente lee `GET /v1/ia/estado` con el token de la plataforma, con `?espacio=` cuando usa la clave del grupo (`fetchAiState` en `src/services/ai.ts`). Si la persona no ha escogido un modelo en el panel, sale elegido el equilibrado de su proveedor preferido para el texto, siempre que esté `lista` (`preferredModel`): Claude Sonnet 5.5 o GPT-5.6 Terra. Con la clave del grupo, igual, entre los modelos que permite la organización. Sin preferencia, o con su proveedor sin estar listo, decide Nodaria como antes. La persona puede escoger otro y se recuerda su elección.
4. **Tras un error:** Nodaria nunca cambia de proveedor ni de modelo. Explica el error y enlaza la gestión de las claves. Con la clave del grupo, ofrece usar la de la persona, avisando de que el gasto será suyo.

**Pruebas:** 2 pruebas nuevas de `preferredModel` y Edge con una sesión simulada. Las 6 comprobaciones pasan: prefiere OpenAI y está lista (sale GPT-5.6 Terra), prefiere OpenAI sin tope (Sonnet), sin preferencia (Sonnet), elección guardada de la persona (Haiku), sin errores de JavaScript. Anunciado como novedad: `2026-10-25-ia-proveedor-preferido`.
