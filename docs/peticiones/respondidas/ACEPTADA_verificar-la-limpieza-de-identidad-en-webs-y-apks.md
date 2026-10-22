# Petición a webs y APK: verificar la limpieza al cambiar de cuenta

Fecha: 2026-10-20 (preparada el 19)
Solicitante: Plataforma Yosiftware
Afecta a: cada web y APK que consume la cuenta común; frontend, sincronización, persistencia, chat y push
Estado: entregada el 2026-10-20 a los ocho destinos locales; respuestas y pruebas externas pendientes

## Contexto

El propietario ha aprobado conservar hasta cinco cuentas en el navegador y elegir una sin cerrar las otras. La cuenta elegida se aplica a todas las webs abiertas; puede pasar directamente de A a B, sin un estado de cierre intermedio. El propietario confirma expresamente que limpiar la identidad es una **obligación de adhesión para webs y APK**, y que la plataforma define ese contrato.

El kit 1.44 y el SDK 1.20 están en QA y producción desde el 20 de octubre de 2026, revisión `1b9ac91` (API, acceso, Social y SDK). Guía completa: `ecosistema-kit/CAMBIO_DE_CUENTA.md`, fuente vigente `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\`. Documentación pública: `docs/publica/CAMBIO_DE_CUENTA.md`, `ACCESO_E_IDENTIDAD.md` y `NOTIFICACIONES.md`. No cambia el formato de autenticación de las APIs de cada proyecto. El SDK de QA se carga desde `https://qa-cuentas.yosiftware.es/sdk/v1/yosiftware.js`; Social, `https://qa-social.yosiftware.es`.

La sesión nativa sigue siendo independiente: cambiar en el navegador no cambia la cuenta de la APK. Cada APK debe limpiar al cambiar localmente, salir o detectar una revocación. La librería de sesión sigue en 1.3.1; copiarla no limpia los datos propios de la app.

## Qué necesitamos

1. Retirar antes de mostrar la siguiente identidad los datos privados de la anterior y detener sus canales, tareas, observadores y suscripciones. Comparar el id de cuenta, además del tipo de estado.
2. Descartar respuestas y cuerpos tardíos, y evitar que un reintento o una sincronización de A se ejecute como B. Cancelar una petición de red no basta por sí solo; A → B → A también debe descartar la generación anterior.
3. Separar cachés, bases locales, archivos y trabajo pendiente por **cuenta y entorno**. Conservar el trabajo de A bajo A, sin borrarlo indiscriminadamente ni subirlo como B.
4. Revisar los avisos push visibles y pendientes. El push central añade `cuenta`: comprobar el destinatario antes de mostrar contenido y antes de presentar un acuse; cerrar los avisos de otra identidad al cambiar.
5. Conservar preferencias de dispositivo y la exclusión de Yosiftadísticas. Se prueba en **web y APK por separado**.
6. Responder con la revisión, las pruebas ejecutadas y lo que quede pendiente. No afirmar que basta con actualizar el SDK: cada proyecto responde de sus datos propios. La implementación concreta es decisión de cada proyecto.

## Comprobaciones previas

La plataforma ha revisado sus clientes propios y añadido protección a tokens, respuestas, cachés, canales, borradores, envíos pendientes y push. Pasan 922 pruebas de Python, 747 de Vitest y 65 de Edge. En QA, con credenciales reales de Firebase y a través de Cloudflare, A → B → A funciona entre `https://pruebas.dev.yosiftware.es` (página mínima con la CSP del kit) y Social sin recarga, conservando las cookies HttpOnly/Secure. También pasan préstamo/retirada y gestor de enlaces reales; las identidades aisladas de prueba se han eliminado. Esto no constituye una prueba de los consumidores externos. Google real y la configuración del correo de Firebase siguen pendientes, sin afectar al contrato de limpieza que se pide aquí.

Revisión inicial de los consumidores, en solo lectura; puntos de entrada que debe revisar cada uno, sin afirmar aún que incumplan:

| Proyecto | Alcance y puntos de revisión |
| --- | --- |
| Fichas 3.5 | Web y **3.5 Companion**. En la APK, `ui/App.kt` usa `LaunchedEffect(estado is EstadoSesion.ConSesion)`; revisar el paso entre ids y sus ViewModels (`DatosViewModel`, `ChatViewModel`), cachés y notificaciones. |
| Nodaria | Web: `src/state/auth.tsx` ya escucha el estado completo. Verificar sus efectos de sincronización, documentos abiertos, peticiones pendientes y datos locales de cada cuenta. |
| Lorcana | Web y APK nativa: `front/src/features/account/webSession.ts`, `Sincronizacion.kt`, la colección y sus ViewModels. Probar las escrituras pendientes y los datos sin red. |
| Poke-Voice | Web: `src/services/yosiftwareAuth.ts` ya sigue `con_sesion` y `sin_sesion`. Revisar sincronización y almacenamiento propio. Si se distribuye como APK, verificar también esa variante. |
| Re-Notas | APK y backend: `AppReNotas.kt`, `OrganizacionesViewModel.kt` y `ServicioDeEnvio.kt`; sesiones, bloqueo, notas, archivos, organizaciones, envíos y avisos. **Conserva la whitelist y queda fuera del alcance público hasta el asesoramiento legal.** |
| Libros | Backend, frontend y APK, al retomar su migración. El frontend del PC recibe esta petición a través del propietario. No se pide desbloquear su trabajo pausado. |
| Hotrods | Incorporarlo a su adhesión futura; sigue parado. No se pide activar su roadmap. |
| Hall | Confirmar si consume sesión o datos privados; si no lo hace, indicar «No aplica». |

## Calendario y dependencias

**Publicado en producción el 20 de octubre de 2026 (`1b9ac91`), por autorización expresa del propietario para probar Google desde fuera de casa.** Se exceptúa el orden previsto de esperar las respuestas externas: las verificaciones de los consumidores siguen abiertas y obligatorias. La publicación no equivale a dar su limpieza por verificada. Los proyectos en espera registran el requisito para su siguiente entrega; no tienen que publicar una función nueva ni abandonar sus prioridades.

Pruebas exigidas: A → B → A, varias pestañas o cambio local de la APK, cierre, revocación al volver a primer plano, lectura y escritura que llegan tarde, trabajo sin red pendiente, reinicio, push tardío/visible/pulsado y preferencias conservadas. El proyecto aporta la evidencia; la plataforma verifica su compatibilidad.

## Fuera de alcance

Google Play y monetización. No se cambia la whitelist de Re-Notas. No se pide guardar varias sesiones nativas dentro de una APK ni cambiar de cuenta automáticamente entre APK. Los préstamos de claves personales a espacios son gestión de la plataforma; el consumidor mantiene `X-Yosi-Espacio` sin recibir el secreto.

## Resolución

Pendiente de cada destinatario. Distinguir expresamente web, APK y variantes sin distribuir.

| Destinatario | Entrega y evidencia pendiente |
| --- | --- |
| Fichas 3.5 | Copia en `Fichas 3.5/docs/peticiones/`; verificar web y Companion por separado. |
| Nodaria | Copia en `nodaria/docs/peticiones/`; verificar web y sincronización. |
| Lorcana | Copia en `mazos lorcana/docs/peticiones/`; verificar web y APK nativa por separado. |
| Poke-Voice | Copia en `poke-voice/docs/peticiones/`; verificar web y confirmar si hay APK distribuida. |
| Re-Notas | Copia en `re-notas/docs/peticiones/`; verificar APK y sus tareas; whitelist intacta. |
| Libros API | Copia en `Libros API/docs/peticiones/`; registrar para su migración. El propietario pasa la petición al frontend del PC. |
| Hotrods | Copia en `hotrods/docs/peticiones/`; registrar para su adhesión futura, sin reactivar el roadmap. |
| Hall | Copia en `yosiftwareIndex/docs/peticiones/`; confirmar alcance o «No aplica». |

## Actualización de publicación (2026-10-20)

Producción sirve la revisión probada en QA, `1b9ac91`, con SDK 1.20 y privacidad 11. API, gateway, administración y páginas comprobados, con copia previa verificada. El propietario probará Google real en producción. Re-Notas conserva su lista de acceso. Firebase rechaza configurar las plantillas y el destino de correo en los dos entornos; el gestor propio está publicado, pero el correo conserva el destino anterior.

Las respuestas de adopción siguen pendientes: distinguir web y APK, con evidencia de los datos, tareas, respuestas tardías y push propios. No se pide reactivar los proyectos pausados. Esta actualización se copia únicamente sobre las ocho peticiones cuyo contenido no ha cambiado, sin modificar código de los destinatarios.

### Respuesta de Nodaria (2026-10-22)

**Web: aceptada, corregida y verificada; en producción el 2026-10-22** (commit `ca56ae2`). Nodaria no tiene APK.

**Lo que había:** al pasar a `sin_sesion`, la sincronización ya retiraba los proyectos de la cuenta y apartaba en IndexedDB, por cuenta, los cambios sin subir (`saveVault`/`takeVault`), y al entrar otra cuenta apartaba antes lo de la anterior. **El fallo encontrado:** en el paso directo A → B, una vuelta de sincronización empezada con A (o programada antes del cambio) terminaba ya con B y bajaba los proyectos de A a la página de B y los subía a la cuenta de B. Reproducido con la prueba de abajo y la protección desactivada.

**Corrección:**
- Generaciones de identidad (`src/services/identity.ts`, con pruebas): `yosiftware:identidad` invalida al momento y cada id confirmado por `alCambiar` abre una generación nueva; A → B → A es otra generación aunque el id vuelva.
- La sincronización de los proyectos propios (`src/state/sync.tsx`) y la de los compartidos de los grupos (`src/state/groups.tsx`) piden el token atado a su generación (`tokenFor`) y comprueban antes de aplicar lo recibido y de guardar su recuerdo; si cambió, lo descartan sin error ni reintento. Al cambiar de id no se sincroniza nada hasta cargar el recuerdo de la cuenta nueva.
- Las vistas y los paneles con datos de la cuenta (asistente de IA, grupo, comentarios) se montan de nuevo con cada cuenta.
- Persistencia: los proyectos visibles son de la cuenta activa; lo sin subir de cada cuenta se guarda aparte por cuenta, y cada entorno es otro origen (otra IndexedDB). Recuerdos de sincronización por cuenta.
- Push: Nodaria no manda ni muestra push propios (el chat y los avisos son del SDK).

**Evidencia** (Edge, perfil limpio, SDK simulado con dos cuentas y la API de Nodaria simulada por cuenta, sin recargar; 15 comprobaciones correctas):
- con A se bajan sus proyectos; sin red, un cambio de A no llega al servidor;
- una lectura lenta de A (2,5 s) que termina con B: con B solo se ven los de B, nada de A en la página y B no recibe ninguna escritura de A (sin la corrección, el proyecto de A aparece con B y se sube a B);
- el panel de cuentas ofrece cambiar a A, añadir otra y salir de todas;
- al volver a A, su trabajo sin subir vuelve y se sube a A, y B nunca recibió nada;
- cierre de sesión con un cambio sin subir: los proyectos de A salen de la página y, al volver A, su cambio vuelve y se sube;
- la exclusión de Yosiftadísticas sigue; sin errores de JavaScript.

**Pendiente:** la prueba con dos pestañas y con cuentas reales de la plataforma la hace el propietario con las suyas (cada pestaña recibe el cambio por su SDK y corre el mismo mecanismo). No se ha reiniciado el navegador con trabajo sin subir en esta prueba; el almacén apartado es IndexedDB y ya sobrevivía a recargas.
