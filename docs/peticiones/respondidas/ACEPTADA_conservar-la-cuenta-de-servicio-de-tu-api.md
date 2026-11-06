# Petición a Nodaria: que vuestra API conserve su cuenta de servicio de Windows

Fecha: 2026-10-31
Solicitante: Plataforma Yosiftware
Afecta a: la tarea `Nodaria API`, vuestro instalador de tareas y vuestro despliegue

## Contexto

Por decisión del propietario (2026-10-30, a petición de Día a día), cada servicio del servidor que atiende peticiones de fuera corre con su propia cuenta de Windows por entorno: sin administrador ni inicio de sesión, que en SQL Server solo lee, escribe y ejecuta en sus bases (`db_datareader`, `db_datawriter` y `EXECUTE` en `dbo`, sin roles de servidor) y que, con el propietario, es la única que lee sus secretos. Lo gestiona la plataforma para todos con `ops\cuentas-de-servicio.ps1` y el inventario `ops\servicios.json` del repositorio `administracion yosiftware` (roadmap `docs/roadmaps/FINALIZADO_cuentas-de-servicio/`).

Vuestra API está en el inventario: será `svc-nodaria-pro`. El propietario la pasa como administrador por tandas; la herramienta comprueba vuestra salud y, si no responde con la cuenta nueva, devuelve la tarea a `Yosi` y lo dice. No tenéis que hacer nada para el cambio en sí.

## Qué necesitamos

1. **Que vuestro instalador no devuelva la tarea a `Yosi`.** Si volvéis a registrar la tarea (`Register-ScheduledTask -Force` con `-UserId Yosi`), la sacáis de su cuenta. Que acepte el usuario como parámetro o, mejor, que si la tarea ya existe no toque su usuario (cambiad solo la acción o los ajustes). Si la cuenta de servicio necesita la tarea con contraseña, eso lo pone la herramienta de la plataforma: no la pidáis ni la guardéis.
2. **Que el esquema lo aplique solo vuestro despliegue**, que corre como `Yosi`. La cuenta de la API no puede crear ni cambiar tablas; un `CREATE TABLE` o un `ALTER` al arrancar fallará.
3. **Que la API escriba solo donde ya escribe.** La cuenta tiene escritura en las carpetas de vuestra entrada del inventario (registros y datos). Si añadís otra, o un secreto nuevo, decídnoslo con una petición y lo añadimos antes de que lo publiquéis.
4. **Que los secretos de un entorno no los lea el otro**: cada entorno, su archivo.
5. Responder en vuestra copia de esta petición con lo que cambiéis, o «No aplica» con su motivo.

**La norma completa, en el kit 1.69** (`ecosistema-kit/SERVIDOR.md`, fuente vigente en `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\`): cópialo y sigue «Qué hace tu proyecto». Incluye cómo reiniciar tu servicio ahora que corre con otra cuenta (una marca que atiende tu vigilante, o tu script de reinicio como administrador: parar la tarea sin elevar no cierra sus procesos) y que los trabajos largos de los agentes van con prioridad baja.

## Comprobaciones previas

La plataforma ya ha hecho, o hará al pasar vuestra API: crear la cuenta, darle sus permisos de carpeta y de SQL Server, cerrar vuestras carpetas de secretos (sin herencia: SYSTEM, administradores y `Yosi`) y marcar vuestro repositorio como de confianza para Git (`safe.directory` en la configuración del sistema), porque Git se niega a leer un repositorio de otro usuario. Para ver qué tiene vuestra cuenta: `ops\cuentas-de-servicio.ps1 -Comprobar -Servicio <clave>` en el repositorio de la plataforma, sin administrador.

## Calendario y dependencias

Sin fecha para vosotros. Vuestra API pasa cuando el propietario ejecute su tanda.

## Fuera de alcance

Cambiar vuestro código, salvo el instalador y, si lo hacía, el esquema al arrancar.

## Resolución

**Aceptada (2026-11-06).** La tarea `Nodaria API` ya corre como `svc-nodaria-pro` (comprobado: `LogonType Password`, retraso `PT2M`).

1. **Instalador** (`api/ops/install-autostart.ps1`, `da898ce`): ya no devuelve la tarea a `Yosi`.
   - Si la tarea no existe, la registra como antes (`Yosi`, S4U), con 2 minutos de retraso.
   - Si existe con otra cuenta, no la toca: solo avisa si le falta el retraso.
   - Si existe como `Yosi`, cambia la acción, el disparador y los ajustes con `Set-ScheduledTask`, nunca el usuario.
   - Ya no para ni arranca la tarea si existía. No pide ni guarda contraseñas.
2. **Esquema**: la API nunca crea ni cambia tablas al arrancar. Las migraciones van con `npm run migrate`, que corre en el despliegue como `Yosi`.
3. **Escritura**: la API solo escribe en `api\logs` (registros y la marca `restart.request`, que crea `ops\restart-api.ps1` y borra la API). Es lo que dice vuestro inventario. No hay carpetas ni secretos nuevos. El reinicio de hoy por esa marca funcionó con la cuenta de servicio.
4. **Secretos por entorno**: producción lee `api\.runtime\plataforma.token` y los de Notificapp. QA lee `plataforma-qa.token` con su `.env.dev`, sin valores por defecto de producción.

Documentado en `docs/backend/README.md`, «Producción».
