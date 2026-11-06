# Petición a Nodaria: renovar el plugin de Notificapp con la estética nueva y el logo

Fecha: 2026-11-05
Solicitante: Notificapp, a petición del propietario
Afecta a: plugin `nodaria-api` (`notificapp-plugin`), instalado en Notificapp en la versión 2.0.1

## Contexto

La APK de Notificapp se ha rediseñado (0.4.5 y 0.4.6, ya instaladas en los móviles del propietario). Ahora tiene tres estilos que elige él: **Terminal** (oscuro, monoespaciado, acento verde), **Claro** (luminoso, acento azul) y **Bento** (negro con bloques de color, acento lima). También tiene iconos de estado (`?`, `✓`, `↻`) y tarjetas compactas. Vuestro panel sigue con la estética anterior, y en la pantalla principal aparece con iniciales porque el paquete instalado no trae icono.

Guía vigente, en `C:\Users\Yosi\Desktop\notificapp\plugin-kit\`:

- `PROJECT_PLUGIN.md`, apartados **«Estética de Notificapp»** e **«Icono obligatorio»**.
- `template/ui/index.html`: plantilla de referencia con el bloque de estilos listo para copiar.

Desde la API 0.4.0, **todo ZIP nuevo debe traer `ui/icon.png`**. Sin él, `pack.py`, `plugin_cli` y la publicación remota lo rechazan.

## Qué necesitamos

1. **Kit al día.** Copiad `plugin-kit/` desde la ruta de arriba sobre vuestra copia local; está ignorada por Git. La nueva `pack.py` valida el icono.
2. **Logo.** Añadid `notificapp-plugin/ui/icon.png` con el logo del proyecto, el mismo que usan su web o su app. Requisitos: PNG cuadrado de 96 a 512 px (se recomiendan 192 × 192), 64 KiB como máximo, con fondo propio y legible a 40 px. La APK lo recorta con esquinas redondeadas y no lo tiñe según el tema.
3. **Estética nueva, a ser posible.** Copiad el bloque «Estética de Notificapp» de la plantilla en `ui/index.html`: las variables CSS de los tres estilos y el script del `<head>` que fija `data-style`. Después sustituid los colores, radios y tipos propios por esas variables y usad sus componentes (`.card`, `.kind`, `.label`, `.chip`, `button.primary` / `button.danger`) donde encajen. El color de marca queda para el icono o algún detalle puntual. Si algo de vuestro panel no encaja, priorizad que se lea bien en los tres estilos y explicadlo en la resolución.
4. **Sin cambios de contrato.** Mantened tal cual el comportamiento, las acciones, los `eventExternalId` y los textos de confirmación. Subid `manifest.version` por encima de la 2.0.1 sin tocar `eventKinds`, `agents` ni `api` (dominio, rutas, métodos, `onSuccess`, `image`).
5. **Publicad por actualización remota**, que está activada para `nodaria-api`:

   ```powershell
   python plugin-kit/pack.py --template notificapp-plugin --output .runtime/nodaria-api-<versión>.notificapp.zip
   python plugin-kit/publish.py --url https://notificapp-api.yosiftware.es --id nodaria-api --token-file <vuestro archivo privado de actualización> .runtime/nodaria-api-<versión>.notificapp.zip
   ```

   Si recibís un 401, vuestra copia del token de actualización es antigua. Copiad sin abrirlo `C:\Users\Yosi\Desktop\notificapp\.runtime\plugin-credentials\nodaria-api-update.token` a vuestro archivo privado y comprobad con `git check-ignore` que está ignorado. Un 403 indica que el paquete cambia permisos: no lo forcéis. Volved al paso 4 o, si de verdad hace falta ampliar algo, entregad el ZIP con una petición a Notificapp para revisarlo con `upgrade` local.
6. **Resolución.** Dejadla en esta misma petición, con la versión publicada, el SHA-256 del ZIP y la respuesta de `publish.py`. Si podéis, añadid capturas o una descripción de cómo queda en los tres estilos.

## Huecos concretos detectados

- `notificapp-plugin/` declara la 2.0.1, igual que la instalada, y no trae `ui/icon.png`.

## Comprobaciones previas

- En el registro de Notificapp, `nodaria-api` está activo, en la versión 2.0.1 y con actualizaciones remotas activadas.
- La plantilla nueva se empaqueta con `pack.py` y se ha comprobado renderizada en Terminal, Claro y Bento.
- `Notificapp.getStyle()` existe desde la APK 0.4.6, ya instalada. El script de la plantilla cae a `getTheme()` y a `prefers-color-scheme` en APK anteriores.

## Calendario y dependencias

Sin calendario. El panel instalado sigue funcionando mientras tanto.

## Fuera de alcance

- Cambiar rutas, dominio, permisos o tipos de evento del plugin, o la API del proyecto.
- Crear un ID nuevo o pedir otra credencial de emisor.
- Incrustar fuentes en el HTML: el WebView no las descarga y el paquete crecería sin ganancia visible.

## Resolución

**Aceptada (2026-11-06).** Publicada la versión **2.0.2** por actualización remota.

- **Kit al día**: `plugin-kit/` copiado de nuevo (la `pack.py` nueva valida el icono).
- **Logo**: `notificapp-plugin/ui/icon.png`. Sale de `public/icon-maskable-512.png`, el de la PWA, reducido a 192 × 192 px. Pesa 11 587 bytes, es RGB opaco (el degradado del logo llena el cuadro) y se reconoce a 40 px. No se usó `icon-192.png` porque tiene las esquinas transparentes.
- **Estética**: el bloque «Estética de Notificapp» de la plantilla, copiado tal cual en `ui/index.html`, con sus variables y el script que fija `data-style`. Se quitaron el beige y el violeta propios y el script de tema anterior.
  - Cada denuncia es una `.card`, con `.warn` mientras está pendiente.
  - El estado va en un `.kind`: `?` para «Pendiente», `✓` para «Retirado» y «Desestimada».
  - Los rótulos usan `.label`. «Retirar el proyecto» es `button.danger`.
- **Sin cambios de contrato**: el manifiesto solo cambia `version` (2.0.1 → 2.0.2). `eventKinds`, `agents` y `api` siguen igual. Las acciones, sus datos, `eventExternalId` (`report-<id>`) y los textos de confirmación también.
- **ZIP**: `api/.runtime/nodaria-api-2.0.2.notificapp.zip`, de 16 990 bytes, ignorado por Git. SHA-256 `992fcb573b36bed29d5011d08802f4ddbe9675dbef0554cf9a74e13f44139bb8`.
- **Respuesta de `publish.py`** (código 0, sin 401): `{"id":"nodaria-api","version":"2.0.2","sha256":"992fcb573b36bed29d5011d08802f4ddbe9675dbef0554cf9a74e13f44139bb8"}`
- **Los tres estilos**: comprobados en Edge sin interfaz con un `Notificapp` simulado y tres denuncias de ejemplo, a 600 y a 360 px. En los tres se lee bien, no hay desbordamiento y los nombres largos saltan de línea.
  - Terminal: fondo oscuro y monoespaciada; la pendiente lleva borde y `?` ámbar.
  - Claro: tarjetas blancas; la pendiente, en melocotón.
  - Bento: tarjetas grafito redondeadas; la pendiente, en lima.
  - No se ha visto en la APK ni con datos reales.

