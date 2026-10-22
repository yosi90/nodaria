# Petición a webs y APK: adoptar el kit 1.45 (panel de cuentas, botón de webs, símbolo, ficha de app y novedades de Yosiftware)

Fecha: 2026-10-22
Solicitante: Plataforma Yosiftware
Afecta a: la cabecera de cada web (cuenta y webs del ecosistema), los enlaces a la web social, la ficha de cada app, el anuncio de las publicaciones y, si la web deja elegir un modelo de IA, ese selector
Estado: entregada el 2026-10-22; **el SDK 1.21 y el kit 1.45 están en QA y en producción desde el 22 de octubre de 2026 (`fcd47d0`)**: ya se puede adoptar en producción

## Contexto

El propietario pidió el 22 de octubre de 2026 una ampliación del roadmap de cuenta y acceso que añade **requisitos de adscripción para todas las webs y APK**. La plataforma ya los tiene hechos en desarrollo (SDK 1.21, kit 1.45); se publicarán en QA y después, con el permiso del propietario, en producción. Esta petición llega antes para que cada proyecto lo planifique; **no hay que tocar nada en producción hasta que la plataforma avise de que el SDK 1.21 está publicado allí** (se anotará aquí y en `docs/publica/ECOSISTEMA.md`). Desde el 22 de octubre de 2026 está en QA (`https://qa-cuentas.yosiftware.es/sdk/v1/yosiftware.js`) **y en producción** (`https://cuentas.yosiftware.es/sdk/v1/yosiftware.js`, revisión `fcd47d0`): ya se puede publicar en producción. La cuenta Yosiftware la siguen todas las cuentas, también las que ya existían.

Fuente vigente del kit: `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\` (versión 1.45). Guía de la ampliación: `docs/publica/ECOSISTEMA.md` de la plataforma.

## Qué necesitamos

1. **Cambiar de cuenta sin salir de la web** (`ACCESO.md`, «El panel de cuentas»; `CAMBIO_DE_CUENTA.md`). Con el SDK 1.21, `<yosi-acceso>` con sesión ya es el avatar que abre un panel como el de Google; si la web tiene su propio menú de cuenta, que lo monte con `yosiftware.cuentasGuardadas()`, `elegirCuenta()`, `anadirCuenta()` y `salirDeTodas()`. Ninguna web manda a la web social ni a una APK para cambiar de cuenta. Las obligaciones de limpieza de la petición del 20 de octubre siguen igual.
2. **El botón de las webs del ecosistema en la cabecera** (`ACCESO.md`, «Las webs del ecosistema»): `<yosi-webs>` (restilable, `ESTILOS.md`) o uno propio con el contenido de `GET /v1/webs`. Obligatorio.
3. **El símbolo del ecosistema en todo enlace a la web social** (`MARCA.md` y `marca/`): sustituye a la «Y» lisa si la web la tenía.
4. **Anunciar cada publicación que la gente nota como novedad de Yosiftware** (`NOVEDADES.md`, «Las novedades de Yosiftware»): el backend llama a `POST /v1/servicio/novedades/yosiftware` con su credencial de servicio al publicar en producción una actualización de la web o de su app, un sistema nacido de una petición de las personas usuarias, un fallo arreglado gracias a un reporte suyo o una app que ya se puede descargar. Conviene añadirlo al `AGENTS.md` con el bloque actualizado (`BLOQUE_AGENTS.md`).
5. **Las APK: la ficha de la app** (`APK.md`, «La ficha de la app»): entregar al propietario el icono de 512 × 512 y una imagen de 1600 × 900 con el icono, el nombre y una ilustración de cómo se ve, como la de Re-Notas, y el nombre de la app si no es el de su web. Y cambiar de cuenta dentro de la app, sin salir a otra (`APK.md`, «Cambiar de cuenta dentro de la app»): hoy, con «Salir» y volver a entrar; la librería con varias cuentas llegará después.
6. **Si la web deja elegir un modelo de IA, nunca con texto libre** (`CLAVES_DE_IA.md`, «Elegir el modelo»): ofrecer los de `GET /v1/ia/modelos`.
7. Responder con lo que aplica a cada proyecto (web y APK por separado), la revisión y las pruebas, o «No aplica» con su motivo. La implementación concreta es decisión de cada proyecto.

## Comprobaciones previas

En la plataforma, en desarrollo: 934 pruebas de Python, 754 de Vitest y 67 de Edge, entre ellas las del panel de cuentas (A → B → A desde la web de pruebas, con el kit tal cual, sin pasar por la web social), del lanzador, de las fichas de apps y de los permisos de modelos, sin violaciones de la CSP. La web de pruebas lleva ya `<yosi-webs>` y el panel de `<yosi-acceso>` sin código propio: basta con la etiqueta. Los iconos de partida de cada web salen de su favicon publicado; si el propio es mejor, que lo entregue al propietario (512 × 512).

| Proyecto | Qué le toca |
| --- | --- |
| Fichas 3.5 | Web: 1 a 4 (y 6 si deja elegir modelo). **3.5 Companion**: 5 (no tiene ficha; su icono de partida sale de su icono adaptable). |
| Nodaria | Web: 1 a 4, y 6 en su asistente de IA si deja elegir modelo. |
| Lorcana | Web: 1 a 4. **Yosircana** (APK nativa): 5; su nombre de app ya está en el registro de desarrollo. |
| Poke-Voice | Web: 1 a 4. |
| Re-Notas | APK: 4 (sus versiones), 5 (su ficha ya es la de referencia) y 6 si deja elegir modelo. **Conserva la lista de acceso y queda fuera del alcance público hasta el asesoramiento legal.** |
| Libros | Backend, frontend y APK, al retomar su migración: registrar los requisitos. El frontend del PC lo recibe a través del propietario. No se pide desbloquear su trabajo pausado. |
| Hotrods | Registrar los requisitos para su adhesión futura; sigue parado. |
| Hall | 2 y 3 si enlaza a la web social o enseña la cuenta; si no, «No aplica». |

## Calendario y dependencias

El SDK 1.21 está publicado en QA y en producción desde el 22 de octubre de 2026 (`fcd47d0`): no hay ninguna dependencia pendiente de la plataforma, salvo la librería Kotlin con varias cuentas (punto 5), que llegará después. Sin fecha por parte de la plataforma.

## Fuera de alcance

Google Play y la monetización. La APK central de la plataforma (QR de sesión y cifrado), en estudio en el roadmap pausado de la plataforma. Cambiar la lista de acceso de Re-Notas. Varias sesiones nativas dentro de una APK, hasta que salga la librería que las soporte.

## Resolución

Pendiente de cada destinatario. Distinguir web, APK y variantes sin distribuir.

### Respuesta de Nodaria (2026-10-22)

**Aceptada y hecha en la web, en producción el 2026-10-22** (commit `ca56ae2`, bundle `main-Vo2FvjrJ.js` en `https://nodaria.yosiftware.es`). Nodaria no tiene APK: lo de la ficha de la app (5) no aplica. Kit 1.46 copiado en `ecosistema-kit/` (ignorado por Git) y bloque de `BLOQUE_AGENTS.md` en su `AGENTS.md`.

1. **Cambiar de cuenta sin salir de la web:** panel de cuentas propio en el menú de la cuenta de la barra (`src/components/account/AccountButton.tsx`): «Otras cuentas» con su miniatura o inicial (`cuentasGuardadas()`, `elegirCuenta()`), «Añadir otra cuenta» (`anadirCuenta()`), «Cerrar sesión» de la activa (`salir()`) y «Cerrar sesión en todas las cuentas» (`salirDeTodas()`). Antes de cambiar se sube lo pendiente. No manda a la web social para cambiar. La limpieza al cambiar se responde en la petición del 20 de octubre (copia en `respondidas/ACEPTADA_verificar-la-limpieza-de-identidad-en-webs-y-apks.md`).
2. **Botón de las webs:** `<yosi-webs nueva-pestana>` en la cabecera, junto a la cuenta (`src/components/layout/EcosystemWebs.tsx`), con el aspecto de los botones de la barra por `::part(boton)`. Comprobado en producción: lista las webs y apps con sus iconos y marca Nodaria; sin violaciones de la CSP (los iconos ya estaban permitidos en `img-src`).
3. **Símbolo:** `simbolo-trazo.svg` tal cual (`src/components/common/YosiSymbol.tsx`) delante de «Gestionar tu cuenta», del botón «Entrar con tu cuenta de Yosiftware», de «Normas y privacidad de Yosiftware», de «Tus claves de IA y su tope» y de los cuatro enlaces a la web social de `/privacidad` y `/condiciones`. Nodaria no tenía la «Y» antigua.
4. **Novedades de Yosiftware:** `src/platform/news.ts` y la orden `npm run anunciar -- <tipo> <idExterno> "<texto>" [enlace]` en la API, con la credencial de servicio y las reglas del kit comprobadas antes de enviar (nombre de la web, 280 caracteres, sin HTML, enlace de `yosiftware.es`). Probada en QA y usada en producción el 2026-10-22: `actualizacion` / `2026-10-22-calendario` («Nodaria estrena el calendario…»), `publicada: true`. Añadido al `AGENTS.md` y a `docs/backend/README.md`.
6. **Modelos de IA:** el asistente ya elegía de una lista, nunca texto libre; ahora solo ofrece los modelos de Nodaria que `GET /v1/ia/modelos` dice que alcanza la clave (con `?espacio=` cuando usa la clave del grupo) y explica el `error` de cada proveedor sin modelos. Si la plataforma no responde, ofrece los de Nodaria (la pasarela los comprueba igualmente).

Pruebas: lint, build, 389 pruebas del front (2 nuevas del filtro de modelos) y 70 de la API (2 nuevas de los anuncios); Edge en producción con el botón de webs, el símbolo y el recorrido de la web.
