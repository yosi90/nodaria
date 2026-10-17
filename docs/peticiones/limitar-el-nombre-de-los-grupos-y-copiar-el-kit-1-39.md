# Petición a Nodaria: limitar el nombre de los grupos a 150 caracteres y copiar el kit 1.39

Fecha: 2026-10-17
Solicitante: plataforma Yosiftware (`C:\Users\Yosi\Desktop\administracion yosiftware`), a petición del propietario.
Afecta a: crear y renombrar grupos (`api/src/routes/groups.ts`, `api/src/platform/spaces.ts`).

## Contexto

El kit 1.39 (2026-10-17, en QA y producción) trae dos cambios de los espacios, a petición de Fichas:

- **El nombre de un espacio admite hasta 150 caracteres** (antes, 80).
- **La plataforma avisa de las solicitudes para entrar**: quien puede aprobar recibe una notificación con «Aprobar» y «Rechazar», y quien la pidió se entera de la respuesta.

Al revisar quién se ve afectado hemos visto que vuestro esquema de crear un grupo admite nombres de hasta 200 caracteres (`name: z.string().trim().min(1).max(200)`) y que `createSpace` los pasa tal cual como `nombre` del espacio. Con más de 150 caracteres, la plataforma responde `400 espacio_no_valido`, y la persona ve «La plataforma no ha podido crear el grupo» (`424 plataforma_no_disponible`). Hasta hoy pasaba a partir de 81. En producción aún no hay ningún grupo, así que no ha afectado a nadie.

## Qué necesitamos

1. **Limitar el nombre de los grupos a 150 caracteres**, en la validación y en la interfaz, o recortarlo a 150 al pasarlo al espacio (y al renombrarlo, si lo hacéis). Lo primero es más claro para la persona.
2. **Copiar el kit 1.39**, anotando la versión.
3. **Las solicitudes:** hoy creáis los espacios solo por invitación, así que los avisos nuevos no os afectan. Si algún día abrís los grupos a solicitudes, la plataforma ya avisa sola: no montéis vuestros propios avisos de solicitudes.

## Comprobaciones previas

- Leídos, en solo lectura, `api/src/routes/groups.ts` y `api/src/platform/spaces.ts` (2026-10-17).
- La plataforma lo ha probado con sus pruebas de integración: el nombre de 150 y el rechazo de 151.

## Calendario y dependencias

Sin calendario. Conviene antes de abrir los grupos a la gente.

## Fuera de alcance

- Cambiar vuestro código: lo hacéis vosotros.

## Resolución

**Aceptada y hecha** (2026-10-17), en producción.

1. **Nombre hasta 150 caracteres** en la validación y en la interfaz: `GROUP_NAME_MAX` en la API (`api/src/groups/model.ts`; `POST /api/grupos` rechaza 151 con `400` y un mensaje claro, sin llamar a la plataforma; prueba de 150 y 151) y en la web (`ShareDialog` propone el nombre del proyecto recortado a 150 y no deja escribir más). Nodaria no renombra grupos: lo hace quien gestiona, en la plataforma.
2. **Kit 1.39** copiado en `ecosistema-kit/` (ignorado por Git) y anotado en `docs/codex/PROJECT_CONTEXT.md` y en `docs/roadmaps/ROADMAP_COLABORACION.md` («Kit 1.39»).
3. **Solicitudes:** los grupos se crean solo por invitación. Anotado en el roadmap que, si algún día se abren a solicitudes, los avisos son los vuestros y no se montan propios.

Verificado: 75 pruebas de la API (también contra SQL Server), lint y 325 del front; API y web publicadas.
