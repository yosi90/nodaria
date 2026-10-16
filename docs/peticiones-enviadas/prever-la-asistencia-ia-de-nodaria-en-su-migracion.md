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

## Resolución

**En curso (2026-10-15).** La petición se acepta, con un cambio de contrato a favor de la seguridad que decidió el propietario: la plataforma **no entregará las claves**. Hará de **pasarela de IA** (bloque 10 del plan de construcción). El propietario la puso, el 2026-10-15, justo después de terminar la migración de Fichas y antes que todo lo demás. El asistente de bases de datos de Nodaria espera a ella; mientras tanto, Nodaria puede preparar su parte sin proveedor. Decisión completa en `docs/agentes/CONTEXTO_PROYECTO.md`, «Decisiones de dominio», 2026-10-15.

- **Cómo funcionará.** El backend de Nodaria llama al proveedor a través de la plataforma, con su credencial de servicio y la cuenta que actúa. La plataforma pone la clave de esa persona y reenvía la llamada, con streaming y límites por web y por cuenta. La clave nunca llega a Nodaria, ni siquiera en memoria. El reparto que propone la petición se mantiene: proveedor y modelo, contexto, límites de uso, validación y aplicación son de Nodaria.
- **La ruta revisada.** `GET /v1/servicio/claves-ia/{idCuenta}` no la usa ninguna web y se retirará al publicar la pasarela. Nodaria no debe programar contra ella.
- **En su migración** (petición `docs/peticiones-enviadas/respondidas/ACEPTADA_migrar-nodaria-a-la-plataforma.md`, entregada el 2026-10-15, que ya le avisa de la pasarela y de que no use la entrega de claves): el consumo de la IA entrará en su guía y en su lista de comprobación cuando exista la pasarela. La web `nodaria` ya está en el registro, y sus orígenes de desarrollo y QA y su credencial de servicio se preparan en la migración. Se probará en QA, como pide la petición, sin que la IA bloquee el cierre de la migración de la cuenta.

Publicación: nada publicado; la guía y el contrato de la pasarela llegarán con su bloque.

**Resuelta (2026-10-16): aceptada, con la pasarela en lugar de la entrega de claves.** Responde a los cinco puntos:

1. **La guía y la lista de comprobación.** El consumo de la IA está en `ecosistema-kit/CLAVES_DE_IA.md` (kit 1.32, rehecho para la pasarela) y en la lista de comprobación del kit, «Claves de IA». La web es `nodaria`, la que ya está en el registro: la persona autoriza su clave para Nodaria (o para todas) en la web social.
2. **Entornos y credencial.** Son los de su migración: los orígenes de desarrollo y QA, y la credencial de servicio de QA (`.runtime/credenciales/nodaria-qa.token` en la plataforma) y la de producción que ya usa su backend. No hace falta otra: la misma credencial llama a la pasarela.
3. **Los pasos vigentes y las decisiones nuevas.** Ya no se recupera ninguna clave. El backend de Nodaria llama a `POST https://cuentas-api.yosiftware.es/v1/servicio/ia/{anthropic|openai}/…` con su credencial y la cuenta en `X-Yosi-Cuenta`, y sirven los SDK oficiales cambiando su dirección base. Lo nuevo desde la guía revisada:
   - solo Anthropic y OpenAI (otro proveedor, con una petición);
   - cada clave tiene un tope de gasto al mes que fija la persona: sin tope no se usa, y al llegar a él la pasarela responde `429 tope_de_gasto`;
   - con tope, solo los modelos de la tabla de precios de la plataforma (`400 modelo_sin_tarifa`);
   - el tope puede recortar la salida, y la respuesta terminar por longitud;
   - hasta 25 MB por llamada, 10 minutos de espera, 30 llamadas por minuto por cuenta y 300 por web.

   Las pruebas que pedía la petición (sin clave, deshabilitada, revocada) se hacen contra la pasarela: `sin_clave_de_ia`, `tope_sin_fijar` y `credencial_no_valida`.
4. **El reparto se mantiene:** la plataforma custodia las claves, aplica la autorización y el tope y registra el gasto; Nodaria elige proveedor y modelo, limita el contexto, valida las propuestas y las aplica. Una persona solo usa sus propias claves: la pasarela usa las de la cuenta de `X-Yosi-Cuenta`, nunca las de otro miembro.
5. **QA.** La pasarela está en QA desde el 2026-10-16 (`4958071`), probada de punta a punta con una clave de verdad del propietario (OpenAI) y con los SDK de Python a través de Cloudflare. Nodaria puede probar allí con su credencial de QA y una cuenta que haya guardado una clave para ella.

Guía pública: `docs/publica/CLAVES_DE_IA.md`; contrato: `ENDPOINTS.md`, «Claves de IA», y `ERRORES.md`, «Pasarela de IA». Roadmap: `docs/roadmaps/ACTIVO_pasarela-ia/`.

Publicación: QA y producción, 2026-10-16 (`4958071`; producción la publicó el propietario, con el secreto sellado).
