# Petición a la plataforma: las ventanas del SDK no se cierran al pulsar fuera ni leen las variables de la web

Fecha: 2026-10-15
Solicitante: Nodaria (`C:\Users\Yosi\Desktop\nodaria`), durante su migración a la cuenta de Yosiftware
Afecta a: el SDK v1 (`<yosi-ventana-acceso>`) y las ventanas de la plataforma (entrar, perfil, reportar), en QA

## Contexto

Nodaria se está migrando según la petición `migrar-nodaria-a-la-plataforma.md` y el kit 1.28. Al probar en QA desde `https://nodaria.dev.yosiftware.es`, el propietario detectó que las ventanas de la plataforma no se cierran al pulsar fuera y que no tienen el aspecto de Nodaria. Se ha comprobado contra `ACCESO.md` («El perfil») y `ESTILOS.md`.

## Qué necesitamos

1. **Cerrar las ventanas al pulsar fuera.** `ACCESO.md` dice del perfil: «se cierra con la X o pulsando fuera». En la práctica ni el perfil (lo probó el propietario con sesión) ni la ventana de entrar (comprobado en Edge 141 sin sesión) se cierran al pulsar en el fondo: solo con la X o con Escape. Si el comportamiento esperado es cerrarse, que lo hagan todas las ventanas (entrar, perfil, reportar y denunciar); si no, que la guía lo diga.
2. **Que las ventanas lean las variables de la web.** `ESTILOS.md` dice que las variables `--yosi-*` «valen en todos los elementos» y que a las ventanas «solo llega la hoja de la web». Nodaria aplica su hoja con `yosiftware.estilos({ css })` y define en ella las variables sobre `[part~='raiz']` con su `data-tema`. La hoja llega (cambia el `::backdrop`), pero la página de acceso pinta con sus propios tokens (`--marca`, `--tinta`, `--superficie`…), no con `--yosi-color-*`, así que las variables no cambian nada dentro. Nodaria lo ha resuelto pintando cada pieza por su nombre (`[part~='boton'][part~='principal']`, `tarjeta`, `campo`, `enlace`…), que sí es contrato. Pedimos que las ventanas tomen también las `--yosi-color-*` (o que la guía diga que solo valen los nombres de las piezas).
3. **Una dirección pública de las normas de uso y de la política de privacidad de la plataforma.** `PRIVACIDAD.md` pide que la web las enlace aunque no se entre, pero no hemos encontrado una dirección canónica (solo `GET /v1/normas/uso`, que es JSON). Mientras, Nodaria enlaza `https://social.yosiftware.es`.

## Comprobaciones previas

- SDK de QA (`https://qa-cuentas.yosiftware.es/sdk/v1/yosiftware.js`), Nodaria servida en `https://nodaria.dev.yosiftware.es` con la CSP del kit, sin violaciones en la consola.
- La ventana de entrar es `yosi-ventana-acceso` (shadow abierto, `dialog` con `part="raiz ventana"`) con un iframe a `https://qa-cuentas.yosiftware.es/`. Pulsar en el fondo no la cierra; Escape sí.
- La hoja de Nodaria se aplica: aparece en `adoptedStyleSheets` del elemento y la página la recibe en el saludo (`estilos`).

## Calendario y dependencias

Sin calendario: no bloquea la migración de Nodaria.

## Fuera de alcance

No se pide cambiar la marca, las normas ni los avisos de las ventanas.

## Resolución

<!-- La rellena el destinatario. Ver docs/peticiones/README.md. -->
