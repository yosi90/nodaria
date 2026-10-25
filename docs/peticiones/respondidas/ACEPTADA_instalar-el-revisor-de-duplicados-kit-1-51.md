# Petición a todos los proyectos: instalar el revisor de duplicados (kit 1.51) y lanzar su auditoría completa

Fecha: 2026-10-23
Solicitante: Plataforma Yosiftware, a petición del propietario
Afecta a: el `AGENTS.md` de cada proyecto, su `.claude/agents/` y, tras la auditoría, el código que tenga duplicado
Estado: entregada el 2026-10-23 en los ocho proyectos; el propietario la lanza proyecto a proyecto

## Contexto

Cuando varios agentes trabajan a la vez en un proyecto, cada uno sin ver lo que hacen los demás, acaban escribiendo varias veces lo mismo: funciones de importes, clientes HTTP, componentes o modelos. En la app Yosiftware pasó, y la compilación falló al unir las ramas. Desde entonces, la plataforma pasa un agente revisor que busca esa funcionalidad repetida y la deja en un solo sitio. El propietario quiere que todos los proyectos lo tengan y que, al instalarlo, revise una vez el proyecto entero.

**El propietario lanzará esta petición proyecto a proyecto.** Hasta que te lo pida, basta con registrarla.

Fuente vigente del kit: `C:\Users\Yosi\Desktop\administracion yosiftware\ecosistema-kit\` (versión 1.51). No cambia el contrato y no es un requisito para adscribirse: es una norma de trabajo.

## Qué necesitamos

1. **Copiar el kit 1.51** en lugar del que tengas. Es compatible con todo lo anterior.
2. **Poner al día el bloque de tu `AGENTS.md`** con el de `BLOQUE_AGENTS.md`, que añade la norma del revisor.
3. **Instalar el revisor**: copia `ecosistema-kit/agentes/revisor-de-duplicados.md` a `.claude/agents/revisor-de-duplicados.md`, rellena sus huecos («RELLENA»: dónde están tus normas, dónde está lo común de cada parte y qué pruebas tiene cada una) y versiónalo. Si el proyecto lo trabaja Codex, ese mismo archivo es su procedimiento.
4. **Lanzarlo en modo `completo` una vez por cada parte del proyecto** (con frontend, backend y APK, tres veces), como explica su apartado «Modo completo»:
   - cada ejecución trabaja sola, sobre su parte y en su propia rama o worktree, nunca en la rama principal, y se une antes de lanzar la siguiente; la última busca además lo que se repite entre partes;
   - aplica lo seguro, con un commit por refactorización;
   - lo grande, o lo que toque un contrato, el esquema o una decisión de dominio, lo deja como propuesta en el `bugs.md` o en un roadmap.

   Cuando termine, pasa la suite completa, une la rama y anota en tu `CONTEXTO_PROYECTO.md` la fecha, la revisión auditada y el veredicto.
5. **Responder** en tu copia de esta petición con:
   - la revisión en que quedó instalado el revisor;
   - la base y la rama de la auditoría;
   - cuántos duplicados unificó;
   - qué propuestas dejó y dónde;
   - las pruebas pasadas.

   Si algo de la plantilla no encaja con tu proyecto, cuéntalo en la respuesta o con una petición aparte.

## Comprobaciones previas

La plataforma ha hecho la prueba ella misma: su revisor es la plantilla rellenada para ella, y su auditoría completa se ha ejecutado siguiendo el mismo procedimiento. El resultado está en «Prueba en la plataforma».

| Proyecto | Qué le toca |
| --- | --- |
| Fichas 3.5 | 1 a 5: una auditoría para la web, otra para su backend y otra para 3.5 Companion. |
| Nodaria | 1 a 5. |
| Lorcana | 1 a 5: una auditoría para la web, otra para la API y otra para Yosircana. |
| Poke-Voice | 1 a 5. |
| Re-Notas | 1 a 5: una auditoría para la APK y otra para su backend. |
| Libros | Backend: 1 a 5, cuando el propietario lo lance, aunque la migración siga pausada. El frontend del PC, a través del propietario. |
| Hotrods | 1 a 5, cuando el propietario lo lance. Sigue parado. |
| Hall | 1 a 5. |

## Calendario y dependencias

No depende de nada de la plataforma. El propietario elige el orden y el momento de cada proyecto.

## Fuera de alcance

Que la plataforma revise el código de otros proyectos: cada proyecto se audita a sí mismo. Notificapp y Yosiftadísticas, que no usan este kit y son servicios mucho más simples (propietario, 2026-10-23). Las propuestas grandes que deje la auditoría las decide cada proyecto con el propietario.

## Prueba en la plataforma

El 23 de octubre de 2026, el revisor auditó la plataforma entera en modo `completo`: unas 127.000 líneas de backend, cuatro webs, el SDK, la app y el kit.
- **Base y rama:** base `fb29ade`, en su propia rama y en un worktree.
- **Lo aplicado:** 11 unificaciones seguras, cada una en su commit. Entre ellas, la comprobación de las imágenes subidas, la huella de los secretos, la firma de los tickets, las llamadas del SDK con el token, los errores de la página de acceso y de la web social, y los formatos de fecha.
- **Lo propuesto:** 12 propuestas que piden una decisión de diseño, de producto o del kit, en un roadmap pausado.
- **Pruebas:** Python 967, Vitest 767 y los tipos de las seis partes. Al unir la rama, en Edge: acceso 8, SDK 3, web de pruebas 45 y administración 13.
- **La plantilla:** se corrigió con lo que se vio al usarla:
  - dónde van las propuestas;
  - que se admite un detector desechable fuera del repositorio;
  - cómo probar desde un worktree;
  - las cifras de las pruebas en el informe;
  - que quedarse con la copia correcta cuenta como seguro;
  - el caso de varios frontales sin librería común.

Cuenta con que una auditoría así es larga: en la plataforma, una sola ejecución para todo el repositorio tardó unos 45 minutos. La regla de una ejecución por parte llegó después, precisamente para que cada una sea más corta y más a fondo.

## Resolución

Pendiente de cada destinatario.

### Respuesta de Nodaria (2026-10-25)

**Aceptada y hecha.** El propietario lanzó la auditoría el mismo día. Las dos ramas están unidas a `main` y publicadas en producción: la API recompilada y reiniciada, y la web con el bundle `main-BjrNaXp1.js`, que tiene el mismo SHA-256 en los dos dominios.

- **Revisión en que quedó instalado el revisor:** `2bf37ba`.
- **Auditoría de la web:** base `b63bff0` y rama `revisor/auditoria-completa-web-2026-10-25`, con 27 commits y 26 duplicados unificados. Entre ellos están un solo cliente de la plataforma en la web, quitar acentos y hacer claves (13 copias), los nombres de archivo de las descargas (8), «id o lista de ids» (10), los diálogos que se abren con un evento, las piezas de los diálogos de bases de datos, el arrastre para reordenar, los comentarios del grupo, las fechas con hora, el CSV y el JSON en `localStorage`.
- **Auditoría de la API (la última, que también busca lo que se repite entre partes):** base `c4b5466` y rama `revisor/auditoria-completa-api-2026-10-25`, con 11 commits y 9 grupos de duplicados unificados. Entre ellos están un solo cliente HTTP de la plataforma y de Notificapp (4 copias), el trabajo periódico (3), la comprobación del documento de un proyecto, el GUID y el Bearer, el aviso por el canal del grupo, las piezas SQL comunes y los tipos de la IA. Además arregló 3 divergencias reales entre la web y la API, cada una con su prueba:
  - la API descartaba las referencias de los subdocumentos;
  - el historial no describía `embed`;
  - la web no recortaba la fecha del mundo al tope de la API, y un mes de nombre largo hacía fallar toda pregunta con un 400.
- **Propuestas, en `bugs.md`:**
  - de la web, D-01 a D-09;
  - entre la API y la web, E-01 a E-07, empezando por una prueba cruzada de los contratos;
  - de la API, A-01 y A-02.
- **Pruebas:**
  - **Web:** lint, build y 467 pruebas.
  - **API:** tipos y 114 pruebas, también contra SQL Server, en una base desechable que crea la propia prueba.
  - **Edge en local:** los 6 guiones de bases de datos, con 73 comprobaciones bien y 1 mal. La mala es una expectativa antigua del guion de Db2: las etiquetas «packed (P)» ya estaban en la base.
  - **Edge en local y en producción:** una prueba de humo de 18 comprobaciones (vistas, arrastre de atributos y preformas, etiquetas, nombre de la descarga y Comunidad sin sesión).
  - **Pendiente:** probar con cuentas reales los comentarios del grupo, publicar y los chats.

Lo que sigue se escribió antes de la auditoría.

1. **Kit:** se ha copiado el 1.58, que incluye el 1.51.
2. **`AGENTS.md`:** puesto al día con el bloque de `BLOQUE_AGENTS.md`, adaptado: dos partes, la web y la API, y el contexto en `docs/codex/PROJECT_CONTEXT.md`.
3. **Revisor:** instalado en `.claude/agents/revisor-de-duplicados.md` en la revisión `2bf37ba`, con los huecos rellenados. Dice dónde están las normas y lo común de la web (`src/domain`, `src/services`, `src/state`, `src/components/common`) y de la API (`api/src/auth`, `platform`, `db` y un módulo por área). Recoge las pruebas de cada parte, con la advertencia de no compilar `api/dist`, que es producción. Señala los contratos de la IA copiados a propósito entre la web y la API, que no comparten paquete.
4. **Auditoría completa:** hecha el 2026-10-25 (ver arriba).

**Lo que no encaja con la plantilla:** el proyecto no usa `CONTEXTO_PROYECTO.md` ni roadmaps `ACTIVO_*`; está adaptado en el archivo.
