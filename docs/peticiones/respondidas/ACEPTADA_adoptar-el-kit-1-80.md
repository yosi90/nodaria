# Petición de la plataforma Yosiftware: cerrar lo que se abre y las cuentas con el correo sin confirmar (kit 1.80)

Fecha: 2026-11-05
Solicitante: la plataforma Yosiftware (`administracion yosiftware`), por decisión del propietario
Afecta a: el `AGENTS.md` de cada proyecto; y, según lo que tenga cada uno, su web (SDK 1.32) o su APK (librería de la sesión 1.9.0)
Estado: entregada el 2026-11-05, con lo de la plataforma ya en QA y producción (`d76d187`: SDK 1.32, librería 1.9.0, app Yosiftware 0.4.0 y la política de privacidad 14)

## Contexto

El kit 1.80 (`ecosistema-kit/README.md`) trae dos cosas que decidió el propietario el 5 de noviembre de 2026.

1. **Cerrar lo que se abre.** Sus palabras: «cuando terminen de usar una herramienta cualquiera, ya sea un emulador (evitar siempre si hay algún móvil en adb), un navegador, un cmd o lo que sea, que lo cierren». Es para todos los proyectos, con o sin web o APK.
2. **Crear una cuenta con correo ya no exige confirmar el correo** (a petición de Rol):
   - la persona entra al momento, y la plataforma se lo recuerda al entrar y, como mínimo, una vez al día;
   - a los 7 días sin confirmarlo, la cuenta se borra;
   - **mientras no lo confirma, no puede usar nada social**, para que no entren bots: amistades, seguir, chat, publicar, comentar y «me gusta», espacios y denuncias responden `403 correo_sin_confirmar`.

   Guía: `docs/publica/ACCESO_E_IDENTIDAD.md`, «El correo sin confirmar».

## Qué necesitamos

1. **Todos los proyectos: la línea nueva en el `AGENTS.md`.** Copiad la línea «Cierra lo que abras» de `ecosistema-kit/BLOQUE_AGENTS.md` en el apartado de la plataforma de vuestro `AGENTS.md`, y seguidla desde ya:
   - al terminar de usar una herramienta, cerradla: un emulador, un navegador (también el de Playwright o una depuración remota), una consola (cmd, PowerShell, bash), un servidor de desarrollo o un proceso de Gradle o de Node que hayáis dejado en marcha;
   - **nunca un emulador si hay un móvil conectado por adb** (`adb devices`); si no queda otra, apagadlo al terminar (`adb emu kill`);
   - cerrad solo lo que hayáis abierto vosotros: lo que ya estaba abierto (del propietario o de otro agente) no se toca.

   Si vuestro proyecto no copia el bloque de la plataforma (Notificapp, Yosiftadísticas, la plantilla de proyectos), poned la regla en vuestras instrucciones de trabajo con esas mismas palabras.
2. **Si vuestro `AGENTS.md` tiene la línea «Si el proyecto tiene APK, se publica en Google Play»**, cambiadla por la nueva del bloque: el aviso «Gratis, por ahora» sigue obligatorio, y Google Play está en pausa desde el kit 1.79.
3. **Si tenéis web con el SDK:** el SDK 1.32 lo hace todo solo. Abre la página de acceso con el código cuando toca recordarlo (se cierra con «Ahora no») y ofrece confirmar el correo cuando lo social de la plataforma responde `correo_sin_confirmar`. Si vuestra web tiene **partes sociales propias** (un chat, comentarios o mensajes entre personas que no pasan por la plataforma), limitadlas igual mientras `cuenta.correoVerificado` sea `false` y ofreced `yosiftware.confirmarCorreo()`. Si no las tiene, no hay nada que hacer.
4. **Si tenéis APK nativa:** pasad a la librería de la sesión 1.9.0 (`ecosistema-kit/APK.md`, «La librería 1.9.0»). Es obligatoria si vuestra app crea cuentas con correo (la 1.8.0); para las demás, recomendada.
   - Cuando `ConSesion.recordarCorreo` sea `true`, enseñad un aviso que se pueda cerrar: el correo, la fecha límite, que hasta confirmarlo no hay parte social, el código de 6 cifras, «Enviar otro código» y «Ahora no». Llamad a `correoRecordado()`.
   - Ante un `403 correo_sin_confirmar`, abrid directamente ese aviso del código, que ya explica que sin confirmarlo no hay parte social. No metáis la frase en una barra inferior con botón: queda apretada.
   - Si la app tiene partes sociales propias, limitadlas igual con `cuenta.correoVerificado`.
   - La app Yosiftware 0.4.0 es el ejemplo (`apps/social-android`, `ui/pantallas/CorreoSinConfirmar.kt`).
5. **La cookie común de la medición** (petición de Yosiftadísticas): si vuestra política de privacidad copia el apartado «Medición de audiencia» en vez de remitir a la de la plataforma, sustituidlo por el de la versión 2 de `estadisticas-kit/POLITICA_DE_COOKIES.md`, tal cual. Comprobad que ni vuestra web ni vuestra API leen, guardan o registran la cookie `yosiftadisticas_ultima`, tampoco en registros que guarden la cabecera `Cookie` completa. Si alguno la registra, decídselo a Yosiftadísticas.
6. **Todos los que guardan datos por cuenta:** una cuenta borrada a los 7 días llega como cualquier otra baja (`CAMBIO_DE_CUENTA.md`): `cuenta.estado` `cerrada` y, en la hora siguiente, `borrada`. Si ya tratáis las bajas, no hay nada nuevo.

## Calendario y dependencias

Sin fecha. El punto 1 es inmediato y no depende de nada. Los demás están disponibles en QA y producción desde la publicación de esta versión.

## Fuera de alcance

- Google Play (en pausa desde el kit 1.79).
- Las cuentas que entran con Google: su correo ya viene confirmado.

## Resolución

**Aceptada (2026-11-06).** Kit 1.82 copiado (incluye el 1.80 y el 1.81).

1. **«Cierra lo que abras»**: la línea del bloque, copiada tal cual en el apartado de la plataforma de `AGENTS.md`, y seguida desde ya. En esta misma sesión se cerraron la instancia de prueba de la API, el servidor de vista previa y los Edge de Playwright al terminar.
2. **Google Play**: el `AGENTS.md` de Nodaria no tenía esa línea (Nodaria no tiene APK). No aplica.
3. **Web con el SDK**: el SDK se carga de `/sdk/v1/` de la plataforma, así que ya es el 1.32. Nodaria tiene partes sociales propias y las limita mientras `cuenta.correoVerificado` sea `false`:
   - publicar un proyecto, denunciar uno, comentar o sugerir en un grupo y crear un grupo usan `requireSocialToken` (`src/state/auth.tsx`). Antes de seguir abre `yosiftware.confirmarCorreo()`; si se cierra, explica «Confirma tu correo para publicar…» y no se sube ni se publica nada;
   - lo social de la plataforma que la web llama directamente (comentarios y «me gusta» de las novedades, amistades, seguir): ante `403 correo_sin_confirmar`, `platformRequest` ofrece confirmarlo y repite la llamada una vez si se confirma.
   - Comprobado en Edge, en local y en producción, con el SDK simulado: con el correo sin confirmar se pide una vez y no se llama a la API; con el correo confirmado no se pide.
   - El token de Nodaria no dice si el correo está confirmado, así que la API no puede comprobarlo por su cuenta. El límite lo pone la web, como dice `ACCESO.md`.
4. **APK nativa**: no aplica, Nodaria no tiene.
5. **La cookie común**: la política de privacidad copiaba el apartado. Se ha sustituido por el de la versión 2 de `estadisticas-kit/POLITICA_DE_COOKIES.md`, tal cual, con la fecha del 6 de noviembre de 2026; ya se sirve en `/privacidad`. Ni la web ni la API leen, guardan o registran `yosiftadisticas_ultima`: la web no lee `document.cookie`, y el registro de la API (pino) guarda el método, la URL, el host y la dirección, no las cabeceras.
6. **Bajas**: Nodaria ya trata `cuenta.estado` `cerrada` y `borrada` desde el feed. No cambia nada.

Publicado el 2026-11-06 con la web 2.2.0 (`da898ce` y `f27c1c4`).

