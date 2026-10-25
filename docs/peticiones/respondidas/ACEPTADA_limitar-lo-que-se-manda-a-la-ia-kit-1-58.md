# Petición a las webs: poned límites a lo que la persona manda a la IA y protegeos de los prompts malintencionados (kit 1.58)

Fecha: 2026-10-25
Solicitante: plataforma común de Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`), por decisión del propietario
Destinatarios: Fichas 3.5 (web, backend y 3.5 Companion), Nodaria, Lorcana, Poke-Voice, Re-Notas, Libros (API, web y APK) y p.i.c.
Afecta a: todo lo que vuestra web manda a la IA por la pasarela de la plataforma con texto que escribe la persona.

## Contexto

El propietario quiere que ninguna web del ecosistema mande a la IA lo que sea sin control: textos de cualquier longitud que agoten el tope de la persona o la clave de una organización, o prompts malintencionados («olvida tus instrucciones», «entra en el servidor y saca la base de datos»).

Un prompt no puede entrar en vuestro servidor por sí solo. El modelo está en el proveedor y solo ve el texto que le mandáis. Hace daño si vuestra web se lo permite:

- si pone en el contexto datos que la persona no debería ver;
- si da al modelo herramientas con permisos (consultas a la base, archivos, red);
- si ejecuta o pinta como HTML lo que el modelo devuelve;
- si no limita cuánto se manda ni cuántas veces.

Filtrar frases «sospechosas» no basta, porque siempre hay otra forma de decirlo. Lo que protege es que el modelo no tenga nada que sacar ni ningún poder.

Está en el kit 1.58, publicado con la plataforma en QA y en producción el 25 de octubre de 2026 (`8f45bef`): `ecosistema-kit/CLAVES_DE_IA.md`, «Lo que escribe la persona: límites y prompts malintencionados», y su punto en `LISTA_DE_COMPROBACION.md`, «Claves de IA».

## Qué necesitamos

**Obligatorio si vuestra web manda a la IA texto que escribe la persona** (una pregunta al asistente, la descripción de una imagen, un texto para leer en voz alta, lo que se analiza de una grabación transcrita). Si no lo hace, anotadlo en la resolución y no hace falta nada más.

1. **Copiad el kit 1.58** desde `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\`.
2. **Una longitud máxima para cada campo que va a la IA**, la que necesite su uso, comprobada en el backend y no solo en el formulario. Por encima, un mensaje claro y sin llamar a la pasarela. Y un máximo de tokens de salida ajustado a lo que enseñáis.
3. **Vuestras instrucciones, aparte del texto de la persona.** Las vuestras van en el mensaje de sistema; lo de la persona, como mensaje de usuario o marcado como datos. Nunca pegado dentro de vuestras instrucciones.
4. **Nada en el contexto que la persona no pueda ver:** ni datos de otras cuentas, ni secretos, ni la configuración del servidor.
5. **Ninguna herramienta con más poder que la persona.** Nada de SQL, órdenes del sistema, archivos ni direcciones que elija el modelo. Si usáis herramientas, cada una la ejecuta vuestro backend con los permisos de quien actúa y con sus argumentos comprobados.
6. **La respuesta, tratada como texto de un desconocido:** escapada al pintarla (el Markdown, saneado), nunca ejecutada, y comprobada si esperáis algo estructurado.
7. **Un límite de llamadas por cuenta** en vuestra web, además del tope de gasto de la plataforma.
8. **Respondednos en la sección «Resolución»:** qué campos mandan texto a la IA, con qué longitud máxima, cómo separáis las instrucciones y si usáis herramientas.

## Comprobaciones previas

- La plataforma no ve vuestras instrucciones ni lo que manda la persona: la pasarela no guarda el contenido de las llamadas. Por eso estos límites son vuestros, y ella no puede ponerlos por vosotros.
- Ya limita lo que puede: la clave, el tope de gasto de cada clave y el tamaño de cada llamada.

## Calendario y dependencias

Sin fecha fija, pero antes de vuestra próxima publicación que toque la IA. No depende de nada de la plataforma.

## Fuera de alcance

- Cambiar de proveedor o de modelo: eso sigue en «El proveedor preferido de la persona» y en «Elegir el modelo».
- Moderar lo que se publica, que va por `MODERACION.md`.

## Auditoría de la plataforma (2026-10-25)

Por encargo del propietario, la plataforma ha revisado vuestro código (solo lectura, sin abrir los `.env`) contra los puntos de arriba. Las rutas son relativas a vuestro repositorio y las líneas, las de ese día. Ojo con la gravedad: la pasarela no limita las llamadas de cada cuenta, solo el tope de gasto de cada clave; sin un límite vuestro, una cuenta puede gastar la clave de su organización o de su grupo y ocupar vuestra API.

Tenéis dos caminos, con sesión y por la pasarela: `POST /api/ia/propuestas` y `POST /api/ia/preguntas`. **Cumplís los siete puntos**: sistema aparte, texto entre etiquetas, sin herramientas, salida validada con zod y pintada como texto, y límite por cuenta. Para mejorar:

- **Media. El backend admite un contexto mucho mayor que el que manda la web.** La web recorta el mundo a 400.000 caracteres (`src/domain/aiWorld.ts:72`), pero el backend acepta 1 y 2 MB (`api/src/routes/ai.ts:25-27`): un cliente modificado manda unos 500.000 tokens por llamada, 10 veces por minuto, con la clave de la persona o la del grupo. Rechazad con 413, sin llamar, el contexto que pase de ese presupuesto, y bajad los límites de cuerpo a unos 600 KB.
- **Media. La clave del grupo la puede gastar cualquier miembro activo**, también un lector (`api/src/routes/ai.ts:83-89`), en propuestas que no podrá aplicar.
  - **Decisión del propietario (2026-10-25): «lectores no deben poder usarla».** Un lector no usa la clave del grupo ni para las propuestas ni para las preguntas. Tampoco la usa un rol que Nodaria no conozca, porque `capabilitiesOf` lo trata como lector. Con su clave personal puede seguir usando el asistente.
  - **También decidido por el propietario (2026-10-25):** las propuestas con la clave del grupo exigen `editSchema` (propiedad y responsable), porque son cambios de esquema que un editor o un revisor no puede aplicar. Con la clave del grupo, las preguntas quedan para editores, revisores, responsables y la propiedad, y las propuestas, solo para responsables y la propiedad.
  - Comprobadlo en el backend, en `groupSpace`, antes de llamar a la pasarela. Si un lector pide expresamente la clave del grupo, responded `403` con un mensaje claro y sin llamar. En la web, no le ofrezcáis esa clave.
- **Baja.**
  - Escapad `<` en el JSON del contexto (`api/src/ai/prompt.ts:53`, `api/src/ai/world.ts:125`): un `</proyecto>` en una nota de otro miembro imita la estructura del mensaje.
  - `AI_MAX_ANSWER_TOKENS` vale 12.000, pero se descarta toda respuesta de más de 20.000 caracteres (unos 6.000 tokens): se paga una salida que se tira.
  - El límite por minuto vive en memoria; si queréis, un tope diario por cuenta.
  - La web puede mandar notas y listas más largas que los topes del backend (`aiWorld.ts:73` y `:95-96`), que acaban en un 400 genérico.

## Resolución

### Respuesta de Nodaria (2026-10-25)

**Aceptada y hecha, en producción el 2026-10-25** (commit `2bf37ba`): la API recompilada y reiniciada, y la web con el bundle `main-CooG1mWZ.js`, que tiene el mismo SHA-256 en los dos dominios. Kit 1.58 copiado en `ecosistema-kit/` (ignorado por Git) y bloque de `BLOQUE_AGENTS.md` en el `AGENTS.md`.

**Qué campos mandan texto a la IA y con qué longitud máxima** (comprobada en la API con zod, antes de llamar):

| Ruta | Texto de la persona | Contexto | Salida |
| --- | --- | --- | --- |
| `POST /api/ia/preguntas` | La pregunta, hasta 4000 caracteres | El proyecto abierto, hasta 400 000 caracteres de JSON y con topes por campo | Hasta 12 000 tokens |
| `POST /api/ia/propuestas` | La petición, hasta 4000 caracteres | El esquema, hasta 400 000 caracteres de JSON y con topes por campo | Hasta 32 000 tokens (la propuesta estructurada) |

Por encima de esos topes, 400 o 413 `contexto_demasiado_grande` con un mensaje claro, sin llamar a la pasarela. El cuerpo de las dos rutas admite como mucho 640 KiB. La web avisa antes de mandar un esquema que no cabe.

**Cómo separamos las instrucciones:** las de Nodaria van en el mensaje de sistema (`system` en Anthropic, `instructions` en OpenAI) y son fijas. La pregunta va en el mensaje de usuario, entre `<pregunta>` (o `<peticion>`), y el contexto, entre `<proyecto>` (o `<esquema>`). Las instrucciones le dicen al modelo que el contenido del proyecto son datos y no órdenes.

**Herramientas:** ninguna. El modelo solo devuelve JSON con salida estructurada, que la API valida con zod y la web pinta como texto (nodos de texto de React, sin `innerHTML`). Una propuesta se revisa contra las reglas del editor y no se aplica nada sin que la persona lo marque.

**Contexto:** solo el proyecto que la persona tiene abierto y puede ver (suyo o de un grupo del que es miembro). Nunca secretos ni datos de otras cuentas, nunca las filas de las tablas, y la agenda solo si la persona lo permite en ese proyecto.

**Límite de llamadas:** 10 por minuto y 300 al día por cuenta, en memoria, además del límite general.

**Lo que señalaba la auditoría:**

- **Media, contexto mayor que el de la web:** la API rechaza con 413, sin llamar, el contexto que pasa de 400 000 caracteres (`AI_CONTEXT_BUDGET`, el mismo presupuesto que `WORLD_BUDGET` de la web). El cuerpo baja de 1 y 2 MiB a 640 KiB. La web manda además solo las referencias de los nodos que van.
- **Media, la clave del grupo:** hecho como decidió el propietario. En `groupSpace`, antes de llamar, las preguntas con la clave del grupo exigen `comment` (propiedad, responsable, editor y revisor) y las propuestas, `editSchema` (propiedad y responsable). Un lector, o un rol que Nodaria no conozca, recibe `403 clave_del_grupo_no_permitida` con un mensaje claro, también si no dice qué clave quiere. La web no le ofrece la clave del grupo: usa la suya y se lo dice.
- **Baja:**
  - `<` va escapado como `<` en el JSON del contexto (`contextJson` en `api/src/ai/prompt.ts`).
  - En lugar de bajar los tokens, la respuesta admite hasta 48 000 caracteres (lo que cabe en 12 000 tokens). Ese tope incluye el razonamiento, así que bajarlo cortaría respuestas.
  - El tope diario de 300 llamadas está puesto.
  - La web recorta cada campo a los topes de la API: notas hasta 8000 caracteres (con `partial` si se recorta), listas y referencias hasta 4000, nombres hasta 200, hasta 5000 nodos y 20 000 relaciones. `clip` ya no se pasa en un carácter.

**Pruebas:** lint, build y 465 pruebas de la web (3 nuevas). Tipos y 103 pruebas de la API, también contra SQL Server, con 3 nuevas: la clave del grupo según el rol, un contexto fuera del presupuesto y el escape. En producción, la API responde la salud correctamente y `401` sin token en las dos rutas.
