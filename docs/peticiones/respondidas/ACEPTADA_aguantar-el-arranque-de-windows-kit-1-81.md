# Petición de la plataforma Yosiftware: que vuestros servicios aguanten el arranque de Windows (kit 1.81)

Fecha: 2026-11-05
Solicitante: la plataforma Yosiftware (`administracion yosiftware`), por decisión del propietario
Afecta a: vuestra API y vuestros procesos del servidor, su vigilante, y la tarea programada que los arranca al iniciar Windows
Estado: entregada el 2026-11-05, con una copia en la carpeta `docs/peticiones/` de cada proyecto con servicios en el servidor, y en la plantilla de proyectos

## Contexto

Todos los servicios del servidor arrancan ya como tareas al iniciar Windows, con su propia cuenta. El propietario preguntó: «cuando inicia el ordenador, SQL Server tarda bastante en estar operativo, ¿eso no les afectará a los servicios?». Puede afectarles: una tarea que arranca antes de que SQL Server acepte conexiones se puede caer, o, peor, quedarse colgada sin base hasta que alguien la reinicie a mano.

Hoy vuestras tareas esperan entre 45 y 90 segundos tras iniciar Windows. No basta para asegurarlo, y no hay un tiempo que valga siempre. Por eso hay dos medidas, las dos en el kit 1.81 (`ecosistema-kit/SERVIDOR.md`, punto 2, y `LISTA_DE_COMPROBACION.md`).

## Qué necesitamos

1. **Que vuestro servicio arranque aunque la base no esté lista, y se recupere solo.** Es lo que de verdad protege.
   - **La API arranca sin la base:** no se cae ni se queda colgada esperándola. Lo anota en su registro y su salud lo dice. Cada petición que la necesite vuelve a intentar la conexión, sin reiniciar la API. Lo que cargue de la base al arrancar (catálogos, configuración) se vuelve a cargar solo cuando la base aparezca.
   - **Los procesos de fondo** (colas, trabajos periódicos, envío de avisos) reintentan en su siguiente pasada en vez de terminar.
   - **Vuestro vigilante** relanza lo que caiga con una espera que crece (por ejemplo, de 5 segundos a 5 minutos), no en un bucle sin pausa.
   - **Probadlo** en desarrollo o QA: arrancad la API con la base apagada o con una cadena de conexión a un puerto cerrado. Comprobad que arranca, que su salud dice que falta la base y que, al devolverle la base, responde sin reiniciarla.
2. **Que vuestra tarea espere al menos 2 minutos al iniciar Windows**, como red de seguridad. La plataforma lo pone con su herramienta (`ops/cuentas-de-servicio.ps1`) en las tareas de su inventario, y lo vigila cada día. Lo que os toca:
   - **Vuestro instalador no lo quita.** Si vuelve a registrar la tarea, conservad el retraso de su disparador de inicio o poned vosotros al menos 2 minutos (`New-ScheduledTaskTrigger -AtStartup` con `Delay = 'PT2M'`).
   - **Si tenéis tareas que corren como `Yosi`** y no están en el inventario de la plataforma (por ejemplo, las de Libros o las de p.i.c.), ponedles vosotros el retraso de 2 minutos.
3. **Respondednos en vuestra copia:** cómo se comporta hoy vuestro servicio sin la base (arranca, se cae o se queda colgado), qué habéis cambiado y la prueba que lo demuestra. Si ya cumplía todo, decid «ya cumplía» y cómo lo habéis comprobado.

Ejemplo, la propia plataforma:
- su API arranca sin la base, lo anota y `/verify` lo dice;
- su registro de webs se vuelve a cargar cada poco hasta que la base responde;
- sus trabajos periódicos reintentan a los 5 minutos;
- su vigilante relanza con espera de 5 segundos a 5 minutos.

## Calendario y dependencias

Sin fecha, pero conviene antes del próximo reinicio del servidor. La plataforma pone el retraso de 2 minutos en las tareas del inventario cuando el propietario ejecute su herramienta como administrador.

## Fuera de alcance

- Cambiar vuestra cuenta de servicio o vuestros permisos: si algo de esto los necesita, pedidlo aparte.
- La instancia de SQL Server, que es común y no cambia.

## Resolución

**Aceptada (2026-11-06).**

**Cómo se comportaba antes:** se caía. `server.ts` esperaba a conectar con la base (`await connectDatabase`) y, si SQL Server no aceptaba conexiones, el proceso terminaba. El vigilante ya la relanzaba con una espera de 5 s a 5 min, así que acababa levantándose, pero la API no estaba en marcha mientras faltaba la base.

**Qué ha cambiado** (`da898ce`):
- **La API arranca sin la base** (`openDatabase` en `api/src/db/pool.ts`). Escucha al momento y anota en su registro que la base no está disponible. Reintenta la conexión con una espera de 5 s a 5 min y escribe «Base de datos conectada.» cuando lo consigue. `/api/health` responde `503` con `database: no_disponible` mientras tanto, sin reintentar ni llenar el registro.
- **Cada petición que necesita la base** vuelve a intentar la conexión (un solo intento a la vez). Si sigue sin estar, responde `503 base_no_disponible`; si aparece, sigue sin reiniciar la API. Nodaria no carga nada de la base al arrancar.
- **Procesos de fondo** (lector del feed, mantenimiento de los grupos y cola de salida de novedades y avisos): ya reintentaban en su siguiente pasada (`createPeriodicTask`). No cambia nada.
- **Vigilante** (`api/ops/run-api.ps1`): ya relanzaba con una espera de 5 s a 5 min y volvía a la corta cuando el proceso aguantaba 5 minutos. Ahora también vuelve a la corta tras una salida limpia. Además, **lo que lanza muere con él** (`2d5a26d`): el vigilante entra en un *job object* con `KILL_ON_JOB_CLOSE`, que la API hereda, y al arrancar cierra una API suya huérfana que tenga el puerto. Probado aparte: al matar el PowerShell, su `node` muere. Activado en producción el 2026-11-06 parando y arrancando la tarea, con unos 5 s sin servicio. El registro dice «Vigilante en su job object».
- **La marca de reinicio** (punto 8): la API solo atiende una marca más nueva que su arranque y, si no la puede borrar, lo anota y sale una sola vez, en vez de cerrarse en bucle. Sigue en `api\logs`, donde la cuenta escribe según vuestro inventario.
- **Retraso de la tarea**: la tarea `Nodaria API` ya tenía `PT2M`, puesto por vuestra herramienta. El instalador (`api/ops/install-autostart.ps1`) ya no lo quita: una tarea nueva se registra con `PT2M`, y si ya existe con otra cuenta no se toca (solo avisa si le falta el retraso). No hay tareas de arranque como `Yosi` fuera del inventario: `Nodaria DB Backup` es diaria, no al iniciar Windows.

**La prueba (2026-11-06):**
- Se arrancó una instancia aparte (puerto 5023, con la plataforma de QA y sin credenciales) contra una base que no existía, `NodariaPruebaArranque`.
- Arrancó, la salud respondió `503 {"status":"degraded","database":"no_disponible"}` y `/api/publicos`, `503 base_no_disponible`.
- Al crear la base, la salud pasó a `200 {"status":"ok","database":"ok"}` a los 7 segundos, sin reiniciar la API. Después se cerró la instancia y se borró la base.
- Hay pruebas automáticas en `api/test/database.test.ts`: la espera que crece, los intentos compartidos, la salud y las rutas. Pasan las 122 de la API, también contra SQL Server.
- En producción, tras el reinicio, el proceso nuevo registró «Base de datos conectada.» y la salud local y la pública responden 200.

