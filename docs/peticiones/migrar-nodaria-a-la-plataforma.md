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

<!-- La rellena Nodaria. -->
