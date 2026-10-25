# Nota para el informe de Bravos Box: incidente de seguridad de Node.js (octubre 2026)

> Texto listo para copiar. Fecha: 23/10/2026.

## Qué pasó

El 21 de octubre de 2026 el proyecto Node.js publicó una actualización de seguridad que corrige 10 vulnerabilidades.
Una de ellas (CVE-2026-111497) permite ejecución remota de código por un error en el descompresor Brotli que Node
incluye en su módulo `zlib`. Se corrigió en las versiones 22.23.4, 24.22.1 y 26.12.1; Node 20 y anteriores no reciben
corrección. No se conocía explotación en uso real al momento de redactar esta nota.

## Cómo afecta a Bravos Box

- El backend usa Express 4. La versión instalada de `body-parser` (1.20.5) no descomprime Brotli, por lo que la falla
  no era alcanzable a través de los cuerpos de los pedidos.
- De todos modos el sistema corre sobre el Node instalado en la máquina o servidor, que debe actualizarse para recibir
  las otras 9 correcciones (verificación de certificados TLS, resolución de nombres DNS, etc.).

## Qué se hizo

1. Se desactivó la descompresión de cuerpos de pedidos (`inflate: false` en `express.json` y `express.urlencoded`,
   `src/app.js`): un pedido comprimido recibe el error 415. Ninguna parte del sistema envía pedidos comprimidos.
2. Se actualizó Node de la máquina de desarrollo a la versión corregida (ver estado en `SEGURIDAD.md`).
3. Se documentó la regla de no ejecutar el sistema en producción sobre versiones de Node sin parches.

## Pendiente

Actualizar Node en el servidor donde se publique el sistema.

## Fuentes

- Node.js: Security Releases del 21 de octubre de 2026 — https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- GBHackers — https://gbhackers.com/node-js-patches-10-security-vulnerabilities/
