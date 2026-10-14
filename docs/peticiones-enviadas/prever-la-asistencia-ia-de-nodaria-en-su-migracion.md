# Prever la asistencia de IA de Nodaria en su migración

Fecha: 2026-10-14. Remitente: Nodaria (`C:/Users/Yosi/Desktop/nodaria`).
Estado: entrega documental a Administración; pendiente de su análisis. **No solicita ejecutar la migración ni implementar IA ahora.** El propietario exige esperar a que Nodaria esté migrada.

## Necesidad

El propietario quiere generar diagramas desde una descripción y solicitar adiciones/correcciones, empezando por diseño de bases de datos: tablas, columnas, PK/FK, unique, nulabilidad, valores permitidos y sugerencias de tablas intermedias. La edición manual y el modelo de los diagramas serán propios de Nodaria.

Plan local: `C:/Users/Yosi/Desktop/nodaria/docs/roadmaps/ROADMAP_IA.md`; evaluación del modelo relacional en `ROADMAP_DIAGRAMAS_BD.md` de la misma carpeta. Ambos están planificados, no implementados. La IA espera a la migración.

## Contrato que reutilizaremos

Se ha revisado `docs/publica/CLAVES_DE_IA.md`: la plataforma ya gestiona las claves cifradas de cada persona y su autorización por web; su backend entrega claves a un backend autorizado mediante `GET /v1/servicio/claves-ia/{idCuenta}`. No pedimos otro almacén de claves ni cambios de contrato por adelantado.

Nodaria enlazará a `https://social.yosiftware.es/?vista=claves-ia`. Tras migrarse, su API validará la cuenta global y los permisos del proyecto y recuperará bajo demanda una clave autorizada para la persona actuante. No se guardará ni expondrá en el navegador, el proyecto, preferencias, JSON, logs ni errores; solo memoria durante la petición. No se accederá a claves de otros integrantes de un grupo.

## Tener en cuenta al preparar la migración

1. Incluir el consumo de claves de IA en la guía/checklist de Nodaria y confirmar el registro de web que se usará para autorizarla.
2. Preparar en su fase correspondiente los orígenes/entornos y la credencial de servicio del backend. No copiar ni emitir secretos como parte de esta petición.
3. Confirmar los pasos vigentes del kit para recuperar claves desde el backend de Nodaria, probar ausencia/deshabilitación/revocación y enlazar la gestión central. Si hay límites o decisiones nuevos desde la guía revisada, indicarlos en la documentación pública/kit.
4. Mantener la división de responsabilidades: la plataforma custodia/autorización; Nodaria selecciona proveedores/modelos soportados, limita consumo y contexto, valida propuestas y aplica operaciones sobre sus datos.
5. Probar en QA después de la migración, con credenciales del entorno y cuentas de prueba autorizadas. No exigir que haya código de IA para cerrar previamente la migración de identidad; dejar la capacidad preparada como hito posterior.

Nodaria sigue usando Firebase para su cuenta actual: su UID no se utilizará como si ya fuera el `idCuenta` central. No se declara iniciada ni terminada su mudanza. Esta solicitud no cambia la iniciativa activa de Administración ni la de colaboración que ya está entregada.

## Evidencia y resolución

Revisión local de documentación, sin llamadas a proveedores, claves reales ni servicios de producción. Por favor, dejar la respuesta según `docs/peticiones/README.md`, enlazando la guía pública/kit que deba consumir Nodaria.

<!-- Resolución a cargo de Administración; no marcar aceptada ni migrada desde Nodaria. -->
