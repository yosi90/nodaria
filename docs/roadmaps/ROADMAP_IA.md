# Asistencia de IA en Nodaria

Fecha: 2026-10-14. Estado: **solo diseño; bloqueado hasta finalizar la migración de Nodaria al ecosistema Yosiftware**, por instrucción expresa del propietario. No inicia la migración, no crea rutas ni formularios de claves y no llama a proveedores. No sustituye al roadmap principal.

## Objetivo

Permitir explicar qué se quiere representar y recibir un diagrama propuesto, generar partes, pedir adiciones/correcciones y revisarlas antes de incorporarlas. Primer caso: [diagramas de bases de datos](ROADMAP_DIAGRAMAS_BD.md); el mecanismo de propuestas debe poder reutilizarse en mapas generales.

## Contrato central revisado

La fuente es `C:/Users/Yosi/Desktop/administracion yosiftware/docs/publica/CLAVES_DE_IA.md` y su referencia en `ENDPOINTS.md`/OpenAPI. Según esa guía, la función central está publicada desde el 2026-10-10; esto no significa que Nodaria esté migrada ni autorizada para usarla.

- Gestión de claves en `https://social.yosiftware.es/?vista=claves-ia`; varias por cuenta, etiqueta/proveedor y autorización por web.
- Las guarda cifradas la plataforma. El navegador de Nodaria no solicita ni obtiene la clave completa ni su sufijo, y el proyecto no la guarda.
- El backend de Nodaria migrado valida el token central y obtiene el id global de la cuenta actuante. Solo cuando vaya a ejecutar su petición, usa la credencial de servicio de su web para `GET /v1/servicio/claves-ia/{idCuenta}`, con filtro de proveedor si procede.
- La clave se utiliza únicamente en memoria durante la petición: no en SQL, IndexedDB, preferencias, exportaciones, logs, errores ni respuestas al navegador. La plataforma registra su entrega; Nodaria no duplica ese almacén ni inventa otro contrato.
- Si no hay clave autorizada, mostrar una explicación y enlazar a la gestión central. En un grupo, cada persona usa una clave autorizada de su propia cuenta; los permisos del proyecto no dan acceso a las claves de otros miembros.

## Reparto y diseño propuesto

**Plataforma:** identidad, sesión, credencial de servicio, alta de la web, custodia/autorización de claves, gestión y auditoría de entrega. **Nodaria:** autorización del proyecto, proveedor/modelo soportado, límites de uso, contexto enviado, generación de propuestas, validación y aplicación.

Nodaria tendrá un servicio propio de asistencia en su API, detrás de la identidad migrada y de los permisos del proyecto. Su contrato concreto se diseña después de la migración; no se presentan rutas propuestas como disponibles.

Flujo: descripción → elegir alcance y proveedor/modelo → backend envía el contexto mínimo → respuesta estructurada con operaciones permitidas → validar → comparar propuesta con el diagrama vigente → editar/aceptar o descartar → aplicar en una transacción deshacible. Contemplar selección de una parte del esquema, cancelación, conflictos de revisión y regeneración de una propuesta.

Por defecto enviar solo definiciones necesarias (tablas/tipos, columnas/atributos y constraints/vínculos), no valores de fichas, notas privadas ni filas reales. Explicar qué saldrá hacia el proveedor. La respuesta del modelo es entrada no fiable: límites de tamaño/cantidad, ids/referencias verificadas, no código ejecutable, no DDL automático y sin herramientas para desplegar o ejecutar consultas reales.

Una propuesta de tabla intermedia o FK se muestra como recomendación con motivo; no altera silenciosamente el proyecto. Aplicar solo operaciones validadas por las mismas reglas del editor manual. Revalidar la revisión del proyecto al aceptar, para no pisar cambios hechos desde que se pidió la generación.

## Hitos y criterios de cierre

- [x] **0. Diseño y entrega documental:** contrastar el contrato central, separar responsabilidades y enviar la dependencia a Administración. La copia local está en `docs/peticiones-enviadas/prever-la-asistencia-ia-de-nodaria-en-su-migracion.md`.
- [ ] **1. Puerta de migración:** Nodaria tiene su guía y migración terminadas, identidad global, autorización de proyectos, registro/credencial de servicio y QA. La plataforma confirma el consumo de claves para esta web. Hasta entonces ningún hito de implementación de IA comienza.
- [ ] **2. Contrato de propuestas:** operaciones acotadas para generar/editar esquema, revisión base, validación de permisos, límites, errores y cancelación. Primero doubles sin secretos; decidir el primer proveedor y los modelos/costes soportados antes de cualquier implementación específica.
- [ ] **3. Proveedor en backend:** recuperación de clave bajo demanda y cliente del proveedor; timeout, límites de entrada/salida, rechazo de modelos arbitrarios y errores sin secretos. Probar falta de clave, deshabilitación/revocación, cuenta/web no autorizadas, límites, fallo del proveedor y ausencia de claves en respuestas/registros/exportación.
- [ ] **4. Interfaz:** describir el objetivo, elegir una parte, proponer creación/adición/corrección, ver diferencias y editar la propuesta. Ningún campo para pegar una API key en Nodaria. Enlace a gestión central y explicación del contexto enviado.
- [ ] **5. Aplicación y concurrencia:** validación del modelo relacional/general, confirmación explícita de la propuesta, deshacer/rehacer atómicos y rechazo/rebase de una revisión obsoleta. No ejecutar SQL ni borrar tablas/fichas sin que aparezca en la propuesta.
- [ ] **6. QA y publicación:** pruebas de contratos y navegador, coste acotado, privacidad/textos legales actualizados si corresponde y revisión de la guía de claves vigente. Publicar siguiendo el procedimiento de la migración; no crear datos de prueba en producción.

## Dependencias y preguntas abiertas

La integración de claves ya tiene contrato; pedir a Administración que incluya su consumo y comprobación en la futura migración, no que invente otro almacén. Decidir allí registro/orígenes/entornos y permisos de servicio. Nodaria decidirá proveedor inicial, modelos, presupuestos, tiempo de espera y si incorpora tareas largas; no usar chat o notificaciones centrales para transportar cada respuesta del modelo.

No hay compromiso de calendario. La IA es opcional: la edición manual y el almacenamiento local siguen siendo útiles sin cuenta ni proveedor.
