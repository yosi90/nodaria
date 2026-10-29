# Petición a los servicios que anuncian como Yosiftware: tu anuncio ya lleva tu icono, y la cabecera solo ilustra (kit 1.65)

Fecha: 2026-10-27
Solicitante: Plataforma Yosiftware
Afecta a: los servicios que publican anuncios de Yosiftware (Rol, Libros, 1d1n y Nodaria)
Estado: entregada el 2026-10-27, con el cambio en QA y en producción (`1ae838c`)

## Contexto

Hasta ahora, la tarjeta de un anuncio vuestro se pintaba con el avatar de Yosiftware, porque los anuncios los publica la cuenta oficial. Desde hoy, en la web social, la tarjeta se pinta con el icono de vuestra web, el de vuestra ficha en el registro. En la app Yosiftware, desde su próxima versión.

- **No tenéis que hacer nada para que el anuncio se vea vuestro.** La novedad trae vuestro icono en `servicio.icono`, y la plataforma lo pone.
- **Por eso la cabecera es solo para ilustrar la noticia** (decisión del propietario): una captura de lo nuevo, una escena, la portada de lo que llega. No pongáis vuestro logo, vuestro nombre o vuestra marca como cabecera para que la noticia se vea vuestra. Eso ya lo hace el icono, y la cabecera repetiría la marca en vez de enseñar la noticia. Si no tenéis una imagen que la ilustre, publicad sin cabecera.

Fuente vigente del kit: `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\` (versión 1.65), `NOVEDADES.md`, «La cabecera».

## Qué necesitamos

1. **Copiar el kit 1.65.**
2. **Rol:** los anuncios 42 («Rol: ahora cada personaje tiene un solo familiar…») y 47 («Rol estrena una creación de personajes renovada…») llevan de cabecera el logotipo de Rol. Cambiadla por una imagen que ilustre cada noticia, con `PUT /v1/servicio/novedades/yosiftware/{idExterno}/cabecera`, o quitadla con `DELETE` en la misma ruta. A partir de ahora, sin el logo.
3. **Libros y 1d1n:** nada que corregir. Vuestras cabeceras ilustran la noticia (la ficha de la app con la app abierta). Seguid así.
4. **Nodaria:** nada obligatorio; no tenéis cabecera. Es para que lo sepáis.
5. Responder en vuestra copia con lo que hagáis, o «No aplica» con su motivo.

## Comprobaciones previas

- En producción, `GET /v1/novedades` da `servicio.icono` en cada anuncio de una web, y la web social lo pinta en el avatar de la tarjeta y junto al nombre del servicio.
- Las cabeceras de los anuncios de producción, revisadas el 2026-10-27: las de Rol son su logotipo; la de Libros es la ficha de su app.

| Servicio | Qué le toca |
| --- | --- |
| Fichas 3.5 (Rol) | 1, 2 y 5. |
| Libros (API y frontend) | 1, 3 y 5. |
| 1d1n | 1, 3 y 5. |
| Nodaria | 1, 4 y 5. |

## Calendario y dependencias

Lo de Rol, cuanto antes: sus dos anuncios se ven ahora con su icono y además con el logo de cabecera.

## Fuera de alcance

- Cambiar los permisos de cabecera de cada web, que siguen como estaban.

## Resolución

Aceptada el 2026-10-29.

1. **Kit 1.65 copiado** en `ecosistema-kit/` (ignorado por Git), con lo de las versiones 1.60 a 1.64.
4. **Enterados.** Nodaria no ha puesto nunca cabecera en sus anuncios. Si alguna vez la pone, será una imagen de la noticia, nunca el logo ni el nombre de Nodaria.

Del resto del kit copiado ahora, lo que toca a Nodaria:

- **1.63, la pasarela de IA por la dirección local:** sí aplica. Las preguntas y propuestas con OpenAI se piden sin streaming, y por la dirección pública Cloudflare las habría cortado a los 100 segundos. La API de Nodaria corre en el servidor de Yosiftware, así que ahora llama a `http://127.0.0.1:5006` (producción) y `http://127.0.0.1:5106` (QA) (`PLATFORM_AI_API` en `api/src/config.ts`). El resto de llamadas a la plataforma siguen por la dirección pública.
- **1.64, las normas por apartados:** en su propia petición.
- **1.60 (logros y el icono en los avisos), 1.61 (búsqueda web y encargos permanentes) y 1.62 (librería de las APK y push):** no aplican. Nodaria no tiene logros, no usa la búsqueda web ni deja encargos, y no tiene app.
