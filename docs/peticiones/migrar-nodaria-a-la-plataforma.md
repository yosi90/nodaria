# Petición a Nodaria: migrar a la cuenta de Yosiftware

Fecha: 2026-10-15
Solicitante: plataforma común de Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`)
Destinatario: Nodaria (`C:\Users\Yosi\Desktop\nodaria`): la API (`api/`), que es la autoridad del contrato, y el frontend.
Afecta a: la cuenta y el inicio de sesión, el perfil, el borrado de la cuenta, la marca del propietario para Yosiftadísticas, el tablón de ideas y errores con su plugin de Notificapp, y la CSP.

## Contexto

La plataforma común está en producción. Poke-Voice y Lorcana ya se han migrado, y Fichas está terminando. El propietario abre ahora la vuestra.

Esta petición sustituye a la de congelación del 2026-10-07 y a su aclaración del 2026-10-09, que tenéis en `docs/peticiones/`: se cierran con esta.

**Respuesta a vuestras dos peticiones** (colaboración e IA). Están en `docs/peticiones/` de la plataforma, con su resolución en curso. El propietario ha decidido:
- **la colaboración** irá sobre los «espacios», un servicio nuevo de la plataforma: los miembros, los roles, las invitaciones (también por correo), la conversación del grupo y un canal por espacio para los cambios del tablero;
- **la IA** irá sobre una «pasarela» de la plataforma, que llama al proveedor con la clave de la persona sin entregarla nunca.

Las dos llegarán después de esta migración: la pasarela, la última del plan. Mientras tanto, **no programéis contra `GET /v1/servicio/claves-ia/{idCuenta}`**, que se retirará al publicar la pasarela. Cuando estén, recibiréis su guía en `docs/publica/` de la plataforma. Esta migración es la puerta de las dos.

El material está en el kit de la plataforma. Copiadlo en vuestra raíz como `ecosistema-kit/`, desde `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\` (versión 1.28), y añadid `/ecosistema-kit/` a vuestro `.gitignore`. Empezad por `README.md` y seguid `MIGRACION.md`. Además:
- `ACCESO.md` (el SDK, el perfil y los errores y propuestas);
- `VALIDAR_TOKENS.md`, con la referencia en Node, y `FEED_DE_CAMBIOS.md`;
- `PRIVACIDAD.md`, `MODERACION.md` y `LISTA_DE_COMPROBACION.md`.

Lo que hemos visto de Nodaria, en solo lectura, el 2026-10-15, está en `docs/roadmaps/ACTIVO_migracion-nodaria/` de la plataforma, «Punto de partida». Si algo no es así, decidlo en la resolución.

## Decisiones del propietario (2026-10-15)

1. **Pasa a la plataforma** (y se retira de Nodaria):

   | Hoy en Nodaria | En la plataforma |
   | --- | --- |
   | Firebase Authentication de `yosiftware-nodaria`, el diálogo de acceso, registro y recuperación, y `users.firebase_uid` | La cuenta de Yosiftware: el SDK y `<yosi-acceso>`, y el `sub` en `users` |
   | `users.display_name` y `photo_url` | El perfil común (`ACCESO.md`, «El perfil») |
   | El borrado de la cuenta con reautenticación | El de la plataforma, en la web social. Cuando el feed avisa con `cuenta.estado` `borrada`, borráis lo suyo (`FEED_DE_CAMBIOS.md`) |
   | `OWNER_FIREBASE_UIDS` y `excludeFromStats` | La marca del propietario, que guarda el SDK |
   | El tablón de ideas y errores (`requests`, `request_updates` y `request_votes`), la bombilla, «Mis peticiones» y el panel de administración (`AdminDialog`, `/api/admin/requests*`) | Los errores y propuestas de la plataforma (`yosiftware.reportar()`), con su listado en la web social. El historial se importa (decisión 4) |
   | Vuestro plugin de Notificapp `nodaria-api` y `notificapp_outbox` | Nada: los errores y propuestas los atiende el plugin de la plataforma. Se retira en el corte (decisión 5) |

2. **Se queda en Nodaria, sin cambios de fondo:**
   - los proyectos y su sincronización;
   - **usarla sin cuenta, en local**: entrar sigue siendo opcional;
   - las preferencias locales, exportar e importar;
   - vuestra política de privacidad, sobre los proyectos.

   Lo que hoy cuelga de `users.id` (los proyectos) sigue igual: solo cambia cómo se encuentra la cuenta.
3. **Se enlazan las dos cuentas que tenéis**, las dos del propietario: la suya y la de su empresa. Cada una conserva sus proyectos. Los identificadores de su cuenta de Yosiftware:
   - en **QA**: `7042db67-5cc3-f111-8c4b-002315ef7116`;
   - en **producción**: `6b89e190-60c3-f111-8c4b-002315ef7116`.

   La cuenta de su empresa la crea el propietario en la plataforma, en QA y en producción, y os dará sus identificadores. Confirmad con él qué cuenta de Nodaria es cada una antes del corte.
4. **El tablón no se pierde: se importa en la plataforma.** Lo importa una herramienta de la plataforma, en el corte, a partir de un archivo que exportáis vosotros (abajo, «El archivo del tablón»).
   - Las ideas pasan a ser propuestas, y los errores, errores.
   - Se conservan los estados, las respuestas, los votos y las fechas.
   - Lo que nunca enseñasteis (los errores, y las ideas en revisión o rechazadas) entra oculto, porque se prometió privado.

   Vosotros no escribís en la plataforma: solo exportáis.
5. **El plugin de Notificapp `nodaria-api` se retira en el corte.** Ya no os quedará nada que espere una decisión del administrador, así que el requisito de adscripción no pide plugin. Su panel de administración desaparece con el tablón, y no hace falta plugin de la administración. El propietario lo desinstala de Notificapp después del corte; vosotros retiráis su código, la cola y sus rutas `/notificapp/v1/*`.
6. **Fuera de esta migración:**
   - las novedades: los proyectos son privados, y no se publica nada sin que el propietario lo decida;
   - la colaboración y la IA (arriba).

## Qué necesitamos

1. **La migración del kit** (`MIGRACION.md`):
   - el identificador global en `users`, sin tocar `users.id` ni los proyectos;
   - la API aceptando solo los tokens de la plataforma, con la audiencia `nodaria-api`, y respetando `restricciones` y `normasPendientes` (`VALIDAR_TOKENS.md`);
   - el feed de cambios con la credencial de servicio: el perfil, y el borrado de la cuenta (`borrada`), que borra sus proyectos;
   - la orden que enlaza las dos cuentas;
   - retirar lo de la tabla de arriba.
2. **El frontend con el SDK:**
   - `<yosi-acceso>`, el perfil de la plataforma, el enlace a `social.yosiftware.es` y «Errores y propuestas» con `yosiftware.reportar()`;
   - la privacidad, según `PRIVACIDAD.md`.

   Entrar sigue siendo opcional: sin sesión, Nodaria funciona en local como ahora.
3. **La sincronización al cambiar de cuenta.** El navegador recuerda qué se sincronizó con la cuenta anterior (`nodaria_sync_v1` y lo que la acompañe). Al entrar por primera vez con la cuenta de Yosiftware no puede subir, bajar ni borrar mal ningún proyecto. Explicad en la resolución cómo lo resolvéis, con su prueba.
4. **La CSP del kit**, que hoy no tenéis. Tiene que admitir:
   - el SDK, la API y el gateway de la plataforma y la ventana de acceso;
   - el script de Yosiftadísticas (`IMPLANTACION.md` o `ADAPTACION.md` de su kit);
   - lo que ya usáis: las imágenes en `data:`, las fuentes propias y `html-to-image`.

   Sin violaciones en la consola.
5. **El archivo del tablón** (abajo), exportado de vuestra base de desarrollo para el ensayo en QA, y de la de producción en el corte.
6. **La lista de comprobación entera**, marcada con su evidencia, y lo que no aplique marcado como «no aplica» (chat, notificaciones, novedades, plugins).
7. **La prueba contra la plataforma de QA** antes de publicar:
   - la API de desarrollo con los tokens, el feed y las rutas de servicio de QA;
   - el frontend desde `https://nodaria.dev.yosiftware.es`;
   - una API y una base de desarrollo **separadas de las de producción**: hoy solo existe la instancia de producción, con la base `Nodaria`, en el 5003;
   - en esa base, las dos cuentas enlazadas a sus identificadores de QA.

## El archivo del tablón

Un JSON en UTF-8, en una carpeta privada vuestra fuera de Git (lleva textos de personas). Nos decís dónde está, y la plataforma lo lee de ahí sin copiarlo a su repositorio. Las cuentas van ya con su identificador global (el `sub`), así que se exporta después de enlazarlas.

```json
{
  "formato": "nodaria-tablon-1",
  "exportadoUtc": "2026-10-20T10:00:00.000Z",
  "peticiones": [
    {
      "id": 12,
      "tipo": "idea",
      "autor": "6b89e190-60c3-f111-8c4b-002315ef7116",
      "titulo": "…",
      "texto": "…",
      "estado": "planificada",
      "duplicadoDe": null,
      "creadoUtc": "…",
      "actualizadoUtc": "…",
      "leidoAutorUtc": null,
      "respuestas": [{ "estado": "abierta", "mensaje": "…", "fechaUtc": "…" }],
      "votos": [{ "cuenta": "…", "fechaUtc": "…" }]
    }
  ]
}
```

- **Qué va:** todas las peticiones, con sus respuestas (`request_updates`) y sus votos (`request_votes`), tal como están: `id`, `estado` y `duplicadoDe` son los vuestros. Las fechas, en UTC con `Z`.
- **No hace falta arreglar nada:** la herramienta comprueba el archivo entero antes de escribir, y lo que no quepa en la plataforma lo resolvemos con el propietario. Por ejemplo, un título de menos de 4 caracteres o un texto de menos de 10.
- **Cómo lo importará la plataforma**, para que lo sepáis:

  | Nodaria | Plataforma |
  | --- | --- |
  | `idea` / `error` | `propuesta` / `error` |
  | `revision` | `recibido`, oculto |
  | `rechazada` | `descartado`, oculto |
  | `abierta` / `planificada` | `confirmado` |
  | `en_curso` | `en_curso` |
  | `hecha` | `resuelto` |
  | `descartada` | `descartado` |
  | `duplicada` | `duplicado` |
  | Un error, en cualquier estado | Oculto |

## Lo que ya ha hecho la plataforma

- **El registro de las webs.** `nodaria` tiene la audiencia `nodaria-api` en QA y en producción, y en producción su origen `https://nodaria.yosiftware.es`.
- **El nombre de desarrollo del frontend.** `nodaria.dev.yosiftware.es` apunta a `127.0.0.13` y tiene su origen en el registro de QA. Se sirve por HTTPS en el 443, con el certificado comodín de `C:\Users\Yosi\yosiftware-cuentas\certificados-desarrollo\` (`MIGRACION.md`, paso 7).
- **Credencial de servicio de QA**, para el feed. Está en `C:\Users\Yosi\Desktop\administracion yosiftware\.runtime\credenciales\nodaria-qa.token`. Copiadla a vuestra configuración privada **sin abrirla, mostrarla ni versionarla**. La de producción la crea el propietario cuando estéis listos para el corte.
- **Cuentas de prueba de QA**, una por caso: activa, limitada, limitada sin fin, con normas pendientes y cerrada. Todas han entrado ya en Nodaria, y sus sesiones están en `C:\Users\Yosi\Desktop\administracion yosiftware\.runtime\pruebas\nodaria-qa.json`. Cómo usarlas: `MIGRACION.md`, paso 7.

## Comprobaciones previas

- La plataforma de QA y la de producción están en marcha, y `MIGRACION.md` está probada con Poke-Voice y Lorcana, y la está siguiendo Fichas.
- El registro de cuentas nuevas de producción está abierto.

## Calendario y dependencias

Sin fecha: cuando el propietario os lo pida. El orden es:
1. La API y el frontend en desarrollo contra QA, con las dos cuentas enlazadas en vuestra base de desarrollo.
2. Vuestra respuesta, con la lista de comprobación y el archivo del tablón de desarrollo. La plataforma ensaya la importación en QA.
3. La credencial de producción.
4. El corte: la copia de seguridad de la base, la API y el frontend a la vez, el enlace de las dos cuentas, el archivo del tablón de producción y su importación. Después, el propietario retira el plugin de Notificapp y apaga los proveedores de Authentication de `yosiftware-nodaria`.

## Fuera de alcance

- Los proyectos y su modelo, el editor de bases de datos y la sincronización local: siguen siendo vuestros.
- La colaboración y la IA (arriba).
- El Firebase propio (`yosiftware-nodaria`): sigue para el Hosting. Después del corte, el propietario apaga sus proveedores de Authentication.

## Resolución

**Aceptada. Corte hecho** (2026-10-15); queda la importación del tablón y retirar el plugin. Roadmap y lista de comprobación con su evidencia: `docs/roadmaps/ROADMAP_MIGRACION_YOSIFTWARE.md` de Nodaria (rama `migracion-yosiftware`, `https://github.com/yosi90/nodaria/tree/migracion-yosiftware`). El «Punto de partida» de vuestro roadmap es correcto.

### Lo hecho (QA)

- **API** (`api/`): valida los tokens de la plataforma con la implementación de referencia del kit (`jose` 6.2.12; ES256, emisor del entorno, audiencia `nodaria-api`, caducidad; el `sub` se valida como GUID). Busca o crea el usuario por `users.id_global` (`uniqueidentifier`, único filtrado); `users.id` y los proyectos no cambian; `firebase_uid` pasa a opcional y se conserva hasta verificar el corte. Respeta `restricciones` (con `creacion`, no deja subir proyectos nuevos: `403 creacion_limitada` con `hasta`) y `normasPendientes` (solo responde `/api/me`). Retirados Firebase Admin, el tablón, el panel de administración, `OWNER_FIREBASE_UIDS`, `excludeFromStats`, la cola y las rutas `/notificapp/v1/*` del plugin.
- **Feed**: lee `/v1/servicio/cambios` con la credencial de servicio y `User-Agent: nodaria-api/1.0`, cada 5 minutos (no hay NATS), con el cursor en `dbo.platform_feed` en la misma transacción. `cerrada` esconde la cuenta, `activa` la recupera, `borrada` borra el usuario y sus proyectos; guarda lo limitado. Perfiles y relaciones no se usan.
- **Enlace**: `npm run enlazar-cuenta -- <id local> <id global>` (idempotente; mueve el identificador de un usuario nuevo y vacío si la persona entró antes; nunca toca uno con proyectos ni reasigna uno ya enlazado). Confirmado con el propietario: hay dos cuentas, las dos suyas. Usuario 4 = administrador (QA `7042db67-5cc3-f111-8c4b-002315ef7116`, producción `6b89e190-60c3-f111-8c4b-002315ef7116`); usuario 5 = trabajo (QA `a808808f-9fc8-f111-8c4d-002315ef7116`, producción `958bafa6-9fc8-f111-8c4d-002315ef7116`). Las dos enlazadas en la base de desarrollo con las de QA.
- **Frontend**: SDK del entorno (`VITE_YOSIFTWARE_SDK`), entrar y salir con `yosiftware.entrar()`/`salir()`, «Mi perfil», «Privacidad», la cuenta en `social.yosiftware.es` y «Errores y propuestas» con `yosiftware.reportar()`. Entrar sigue siendo opcional. Hoja de estilos de Nodaria para el SDK (`yosiftware.estilos`).
- **Sincronización al cambiar de cuenta** (punto 3): `GET /api/me` devuelve `legacyAccount`, el UID de Firebase de la cuenta enlazada. El navegador adopta su recuerdo (`nodaria_sync_v1`) bajo el identificador global, así que la primera entrada con la cuenta de Yosiftware ve las mismas versiones y no sube, baja ni borra nada de más. El recuerdo de otra cuenta no se usa: se parte de cero, sin borrar nunca en la cuenta. Pruebas: `src/services/sync.test.ts` («memoria al pasar a la cuenta de Yosiftware»), con el caso de Munfamed: plan vacío; un borrado local posterior se sigue propagando; con el recuerdo de otra cuenta solo se baja.
- **Al terminar la sesión** (petición del propietario tras su prueba): desde Nodaria, desde otra web, al caducar o al abrir la página sin sesión, los proyectos de la cuenta salen del navegador. Los cambios sin subir se apartan en IndexedDB, sin enseñarse, hasta que vuelve a entrar esa misma cuenta (como permite la lista de comprobación).
- **CSP** (punto 4): `src/services/csp.ts` por entorno, servida por Firebase Hosting (`firebase.json`, comprobada por prueba) y en la vista previa de QA. Admite SDK, API, tiempo real y acceso de la plataforma, `img-src` de su API, Yosiftadísticas, `data:`/`blob:` y las fuentes propias. Sin `unsafe-inline`. Sin violaciones en la consola en QA.
- **Prueba contra QA** (punto 7): API de desarrollo separada (`127.0.0.1:5013`, base `NodariaDev`, restaurada de la copia de producción) y web en `https://nodaria.dev.yosiftware.es`. Cuentas de prueba (`api/ops/qa-smoke.mjs`): `activa` entra, lista y crea; `limitada` y `limitada-sin-fin`, `403 creacion_limitada`; `normas` sin `normasPendientes` (Nodaria no tiene normas propias); `cerrada` sin sesión. El propietario entró con su cuenta de QA, vio sus proyectos de antes, su perfil y su privacidad.
- **Pruebas**: API 29 (con integración en SQL Server: enlace, feed y exportación); web 292.

### El archivo del tablón (punto 5)

Desarrollo: `C:\Users\Yosi\nodaria-privado\tablon-desarrollo.json` (fuera de Git), formato `nodaria-tablon-1`: 1 petición, 2 respuestas y 1 voto, todas las cuentas por su identificador global de QA. Listo para el ensayo de la importación. El de producción se exporta en el corte, después de enlazar con los identificadores de producción (`npm run exportar-tablon -- <archivo>`).

### Lista de comprobación (punto 6)

Marcada con su evidencia en el roadmap. No aplican: claves de IA, novedades, chat, notificaciones, denuncias (sin zonas sociales), app Android y panel de administración (se retira con el tablón). Pendiente: entrar y salir con la sesión compartida entre webs en QA, y el enlace en producción.

### Pendiente

1. La credencial de servicio de producción, en `api/.runtime/plataforma.token` de Nodaria (la pega el propietario).
2. El corte, en el orden de la petición: copia verificada de `Nodaria`, migración 0006, enlace de las dos cuentas con los identificadores de producción, archivo del tablón de producción, API y web a la vez. Después, desinstalar el plugin `nodaria-api` y apagar Authentication de `yosiftware-nodaria`.
3. Tras importar el tablón en producción, Nodaria retira sus tablas (`requests`, `request_updates`, `request_votes`, `notificapp_outbox`).

### Lo que hemos visto de la plataforma

Petición aparte: `docs/peticiones/ventanas-del-sdk-cerrar-fuera-y-estilos-de-la-web.md` (las ventanas no se cierran al pulsar fuera, no leen `--yosi-color-*` y falta una dirección pública de las normas y la política de privacidad). No bloquea la migración.

### Corte (2026-10-15)

**Corte hecho el 2026-10-15 (20:32–20:40 UTC).** Copia verificada `C:\Users\Yosi\nodaria-backups\db\Nodaria-corte-yosiftware-20261015.bak` (`RESTORE VERIFYONLY` correcto); migración 0006 en `Nodaria`; usuarios 4 y 5 enlazados con sus identificadores de producción (`linked`); tablón de producción exportado en `C:\Users\Yosi\nodaria-privado\tablon-produccion.json` (1 petición, 2 respuestas, 1 voto, sin cuentas sin enlazar); API recompilada desde cero y reiniciada (salud correcta, `401 no_autenticado` sin token, rutas del tablón y de Notificapp en 404, feed leído con cursor 14); `migracion-yosiftware` fusionada en `main` (`946716b`) y web publicada (bundle `main-CObhy75Q.js`, SHA-256 idéntico en los dos dominios, SDK y CSP de producción). Edge en producción sin sesión: SDK en `sin_sesion`, ventana de entrar con el aspecto de Nodaria, sin errores ni violaciones de CSP.

Para la plataforma:
- **El archivo del tablón de producción** para la importación: `C:\Users\Yosi\nodaria-privado\tablon-produccion.json` (formato `nodaria-tablon-1`, cuentas con sus identificadores de producción). Nodaria retirará sus tablas del tablón cuando confirméis la importación.
- **Lo del propietario**: desinstalar el plugin `nodaria-api` de Notificapp (sus rutas ya responden 404) y apagar los proveedores de Authentication de `yosiftware-nodaria`.
- Con la petición de las ventanas del SDK resuelta (kit 1.29), Nodaria enlaza ya `https://social.yosiftware.es/?vista=normas`.
