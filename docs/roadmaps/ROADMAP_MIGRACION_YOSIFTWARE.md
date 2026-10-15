# Migración a la cuenta de Yosiftware

Fecha: 2026-10-15. Estado: **ACTIVO — API y frontend migrados en la rama `migracion-yosiftware` y probados contra QA; falta la prueba del propietario con sesión, la cuenta de su empresa y el corte.**

Origen: la petición de la plataforma [`migrar-nodaria-a-la-plataforma.md`](../peticiones/migrar-nodaria-a-la-plataforma.md) (2026-10-15), que sustituye a las de congelación. Guía: `ecosistema-kit/` 1.28 (`MIGRACION.md`, `LISTA_DE_COMPROBACION.md`). Roadmap de la plataforma: `docs/roadmaps/ACTIVO_migracion-nodaria/` de la administración.

## Objetivo y alcance

Nodaria funciona solo con la cuenta de Yosiftware, sin perder los proyectos de las dos cuentas del propietario ni el tablón de ideas y errores, que pasa a los errores y propuestas de la plataforma. Usarla sin cuenta, en local, sigue igual.

Fuera: la colaboración (espera a los espacios) y la IA (espera a la pasarela); no se programa contra `GET /v1/servicio/claves-ia/{idCuenta}`. Las novedades no aplican: los proyectos son privados.

## Decisiones

- **Rama propia** (`migracion-yosiftware`): el corte es publicar API y frontend a la vez; mientras, `main` sigue publicable para arreglos.
- **Producción intacta hasta el corte**: la API de producción ejecuta `api/dist` (no se recompila) contra la base `Nodaria`. Desarrollo: API con `tsx` en `127.0.0.1:5013` (`api/.env.dev`, logs en `api/logs-dev`, que también separa su archivo de reinicio) contra **`NodariaDev`**, restaurada de la copia de producción del 2026-10-15 04:40.
- **Identidad**: `users.id_global` (`uniqueidentifier`, único filtrado). `firebase_uid` pasa a opcional y se conserva hasta verificar la migración en producción. `users.id` no cambia: los proyectos siguen colgando del mismo usuario.
- **Enlace de cuentas**: `npm run enlazar-cuenta -- <id local> <id global>` (idempotente; si la persona entró antes y la API le creó un usuario vacío, mueve el identificador y borra el vacío; con proyectos, no toca nada).
- **Sincronización al cambiar de identidad**: la memoria del navegador (`nodaria_sync_v1`) estaba ligada al UID de Firebase. `GET /api/me` devuelve `legacyAccount` (el UID de Firebase de la cuenta enlazada) y el frontend adopta ese recuerdo bajo el identificador global: la primera entrada con la cuenta de Yosiftware ve las mismas versiones y no sube, baja ni borra nada de más. El recuerdo de otra cuenta no se usa (se parte de cero, sin borrar nunca en la cuenta).
- **Moderación**: con `creacion` limitada, la API rechaza subir proyectos nuevos (`403 creacion_limitada`, con `hasta`) y deja leer, cambiar los existentes y borrar; el frontend no los intenta subir y lo explica en el menú de la cuenta. Con `normasPendientes`, solo `/api/me` responde (Nodaria no tiene normas propias publicadas).
- **Feed**: cada 5 minutos (1 en desarrollo), sin NATS. Aplica `cuenta.estado`: `cerrada` esconde la cuenta (403 `cuenta_cerrada`), `activa` la recupera y `borrada` borra el usuario y sus proyectos. Guarda lo limitado. El cursor va en `dbo.platform_feed`, en la misma transacción.
- **Datos propios**: «Borrar mis datos de Nodaria» (`DELETE /api/me`) borra el usuario local y sus proyectos del servidor; la cuenta se borra en la web social. La descarga de los datos propios es «Exportar JSON» de cada proyecto.
- **Al terminar la sesión** (desde Nodaria, desde otra web, al caducar, o al abrir la página sin sesión con proyectos de una cuenta en el navegador): los proyectos de la cuenta salen del navegador, que queda como recién abierto. Lo que ya está en la cuenta no hace falta aquí; los cambios sin subir se apartan en IndexedDB (`backups`, `vault:<cuenta>`), sin enseñarse, y vuelven al entrar esa misma cuenta, antes de sincronizar. Al entrar otra cuenta, lo de la anterior se aparta primero. Pedido por el propietario tras su prueba (2026-10-15): dejar los proyectos a la vista era un problema de seguridad. Sin cuenta, Nodaria sigue funcionando en local como siempre.
- **Aspecto de las ventanas del SDK**: hoja de Nodaria con `yosiftware.estilos({ css })` (`src/services/yosiftwareStyles.ts`): variables `--yosi-*` y, como las ventanas de la plataforma no las leen, cada pieza por su nombre (`[part~=…]`), con la letra Inter servida desde `/fonts/`. No toca la marca, las normas ni los avisos.
- **CSP** por entorno en `src/services/csp.ts`: Firebase Hosting (`firebase.json`, comprobado por prueba) y la vista previa de QA. Sin `unsafe-inline`.

## Fases

- [x] **1. Preparación** (2026-10-15): kit 1.28 en `ecosistema-kit/` (ignorado), `NodariaDev`, credencial de servicio de QA y sesiones de prueba copiadas a `api/.runtime/` sin abrirlas, `nodaria.dev.yosiftware.es` comprobado.
- [x] **2. API**: tokens de la plataforma con el validador de referencia (`jose` 6.2.12), migración 0006, feed, órdenes de enlace y exportación; retirados Firebase Admin, el tablón, el panel y el plugin de Notificapp. 29 pruebas, también de integración con SQL Server. Prueba de humo con tokens reales de QA (`api/ops/qa-smoke.mjs`).
- [x] **3. Frontend**: SDK, menú de cuenta, errores y propuestas, CSP, adopción de la memoria, textos legales. 291 pruebas. Edge contra QA en `https://nodaria.dev.yosiftware.es`: SDK en `sin_sesion`, ventana de acceso y formulario de reportes, sin violaciones de CSP ni errores.
- [x] **4. Archivo del tablón de desarrollo**: `C:\Users\Yosi\nodaria-privado\tablon-desarrollo.json` (fuera de Git), 1 petición, 2 respuestas, 1 voto, todas las cuentas enlazadas.
- [x] **5. Prueba del propietario con sesión en QA** (2026-10-15): entró, vio Munfamed, su perfil y su privacidad. Detectó tres cosas: los proyectos seguían a la vista sin sesión (corregido: se retiran), las ventanas sin el aspecto de Nodaria (corregido con la hoja) y que no se cierran al pulsar fuera (fallo del SDK: petición [`ventanas-del-sdk-cerrar-fuera-y-estilos-de-la-web.md`](../peticiones-enviadas/ventanas-del-sdk-cerrar-fuera-y-estilos-de-la-web.md)). Falta repetirla con estos cambios.
- [x] **6. Cuentas** (2026-10-15): solo hay dos, las dos del propietario. Usuario 4 = cuenta de administrador (QA `7042db67-5cc3-f111-8c4b-002315ef7116`, producción `6b89e190-60c3-f111-8c4b-002315ef7116`); usuario 5 = cuenta de trabajo (QA `a808808f-9fc8-f111-8c4d-002315ef7116`, producción `958bafa6-9fc8-f111-8c4d-002315ef7116`). Las dos enlazadas en `NodariaDev` con las de QA.
- [ ] **7. Respuesta a la plataforma** con esta lista y el archivo del tablón; ensayo de la importación en QA.
- [ ] **8. Corte** (con la credencial de producción del propietario en `api/.runtime/plataforma.token`): copia verificada de `Nodaria`; `npm run migrate`; `enlazar-cuenta` de las dos cuentas con los identificadores de producción; `exportar-tablon` de producción; `npm run build` en `api/` y reinicio; merge a `main` y `npm run deploy`; comprobar y avisar a la plataforma. Después, el propietario desinstala el plugin `nodaria-api` y apaga Authentication de `yosiftware-nodaria`.
- [ ] **9. Cierre**: migración 0007 que retire `requests`, `request_updates`, `request_votes` y `notificapp_outbox` (tras la importación en producción) y, cuando se verifique, las columnas de Firebase; peticiones de congelación cerradas.

## Lista de comprobación del kit

Evidencia: P = pruebas automatizadas; Q = prueba contra QA (2026-10-15); R = revisión de código. «Pendiente» = espera a la fase indicada.

**Adscripción**
- [x] Yosiftadísticas: se carga en todas las páginas y la CSP admite su script y su envío; la marca del propietario la pone ahora el SDK (retirada `OWNER_FIREBASE_UIDS` y `excludeFromStats`). R.
- [x] Nada espera ya una decisión del administrador (el tablón pasa a la plataforma): no hace falta plugin. R.

**Acceso**
- [ ] En el registro con sus orígenes y audiencia: producción hecho por la plataforma; QA con `nodaria.dev`. Pendiente de confirmar el origen de producción tras el corte.
- [x] Carga el SDK del entorno desde la plataforma (`%VITE_YOSIFTWARE_SDK%`), sin copiarlo. Q.
- [x] Sin formularios propios de cuenta ni Firebase Authentication (retirados `SignInDialog`, `DeleteAccountDialog`, `firebase`). R.
- [x] Entra y sale con `yosiftware.entrar()` y `salir()`. Q (entrar); salir pendiente de 5.
- [x] Al pasar a `sin_sesion` (también al cargar sin sesión) retira los proyectos de la cuenta y aparta, sin enseñarlos, los cambios sin subir hasta que vuelve a entrar la misma cuenta. P y Q (Edge con proyectos sembrados).
- [x] Identifica por `cuenta.id` / `sub`. P.
- [x] No guarda tokens: se piden al SDK cada vez. R.
- [x] Sin lista propia de cuentas del propietario. R.

**Errores y propuestas**
- [x] `yosiftware.reportar()` en la barra, la ayuda y la paleta; retirado el tablón propio. Q.

**Perfil y ajustes**
- [x] «Mi perfil» con `editarPerfil()`; avatar de `perfil()`. No guarda nombre ni foto (columnas antiguas sin escribir). R; pendiente de 5.
- [x] Enlace a `social.yosiftware.es` en el menú de la cuenta y en los textos legales. R.
- [x] No tenía país. — Preferencias: locales del navegador; no hay preferencias por cuenta (no aplica `ajustes`).

**Claves de IA**: no aplica (IA fuera de esta migración).

**Feed de cambios**
- [x] Lee `/v1/servicio/cambios` con la credencial y el cursor en su base, en la misma transacción. P y Q (13 cambios aplicados, cursor 41). Sin NATS: cada 5 minutos.
- [x] No guarda perfiles ni relaciones (no los usa). — No aplica bloquear (sin zonas sociales).

**Tus datos**
- [x] `cerrada` esconde la cuenta y `borrada` borra lo suyo. P.
- [x] Descarga: exportar JSON de cada proyecto; borrar sus datos desde el menú; la cuenta, en la web social. R.
- [x] No enlaza perfiles de otras personas. — No aplica.

**Novedades, chat, notificaciones**: no aplica (sin contenido compartido, chat ni avisos propios).

**Moderación y normas**
- [x] Sin sanciones ni casos propios. R.
- [x] Respeta `creacion` en la API y el frontend. P y Q (cuentas `limitada` y `limitada-sin-fin`: `403 creacion_limitada`).
- [x] Sin normas propias; la API rechaza con `normasPendientes`. P.
- [x] Sin zonas sociales ni cola propia. — No aplica «Denunciar».

**Privacidad**
- [x] «Privacidad» en el menú de la cuenta (`yosiftware.privacidad()`). R; pendiente de 5.
- [x] No obliga a entrar; sin cuenta sigue enlazando las condiciones, la privacidad y la web social, y midiéndose. Q.
- [x] No es discreta ni acepta reportes sin cuenta (no se ha pedido). —

**Cabeceras**
- [x] CSP con SDK, API y tiempo real, acceso e `img-src` de la plataforma, sin `unsafe-inline`. P (coincide con `firebase.json`) y Q (sin violaciones en la consola).
- [x] Sin COOP `same-origin` ni COEP. R.

**API**
- [x] Validación de referencia: ES256, emisor, audiencia y caducidad. P (tokens firmados de prueba, otra audiencia, otro emisor, caducado, `sub` no GUID) y Q.
- [x] 401 con `token_caducado` o `no_autenticado`. P.
- [x] Permisos en su base por `sub` (no quedan permisos: el `is_admin` del tablón se retira). R.
- [x] Rutas propias de cuenta retiradas (`DELETE /me` ya no borra la cuenta, solo los datos de Nodaria). R.

**Migración**
- [x] `id_global` único cuando no es nulo; la API busca por él; las claves internas no cambian. P.
- [ ] Cuentas enlazadas en QA y producción: la del propietario en `NodariaDev` (QA); la de la empresa y producción, pendientes de 6 y 8.
- [x] Los usuarios locales siguen en su base. P.
- [x] La API ya no acepta tokens de Firebase. P.

**App Android y panel de administración**: no aplica (el panel del tablón se retira).

**En QA**
- [x] Desde `https://nodaria.dev.yosiftware.es` contra QA. Q.
- [ ] Entrar y salir; sesión compartida con otra web; perfil guardado. Pendiente de 5.
- [x] Sin violaciones de CSP. Q.
