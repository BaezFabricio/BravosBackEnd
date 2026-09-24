const { errorResponse } = require('../utils/response');

/**
 * Limitador de intentos en memoria (sin dependencias externas).
 *
 * Frena la fuerza bruta: probar contraseñas o códigos de recuperación a miles por segundo.
 * Los contadores se pierden al reiniciar el servidor (alcanza para una sola instancia; si el
 * sistema se publica con varias instancias, habría que pasarlos a un almacén compartido).
 *
 * @param {object}   opciones
 * @param {number}   opciones.ventanaMs   Duración de la ventana de conteo.
 * @param {number}   opciones.max          Intentos permitidos dentro de la ventana.
 * @param {function} opciones.clave        (req) => string | null. Qué se cuenta (IP, correo, ambos...).
 * @param {boolean}  [opciones.soloFallos] Si es true, solo cuentan las respuestas con error del cliente
 *                                         (así un login correcto no gasta intentos).
 * @param {string}   [opciones.mensaje]    Texto que verá la persona al pasarse del límite.
 */
function crearLimitador({ ventanaMs, max, clave, soloFallos = false, mensaje }) {
  const registros = new Map(); // clave -> { cuenta, venceEn }

  // Limpieza periódica para que el mapa no crezca sin límite
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of registros) if (v.venceEn <= ahora) registros.delete(k);
  }, 60 * 1000);
  limpieza.unref();

  const sumar = (k) => {
    const ahora = Date.now();
    const actual = registros.get(k);
    if (!actual || actual.venceEn <= ahora) {
      registros.set(k, { cuenta: 1, venceEn: ahora + ventanaMs });
    } else {
      actual.cuenta += 1;
    }
  };

  return function limitarIntentos(req, res, next) {
    const k = clave(req);
    if (!k) return next();

    const actual = registros.get(k);
    if (actual && actual.venceEn > Date.now() && actual.cuenta >= max) {
      const espera = Math.ceil((actual.venceEn - Date.now()) / 1000);
      res.set('Retry-After', String(espera));
      return errorResponse(
        res,
        mensaje || `Demasiados intentos. Probá de nuevo en ${Math.ceil(espera / 60)} minuto(s).`,
        'RATE_LIMITED',
        429
      );
    }

    if (soloFallos) {
      // Se cuenta recién cuando se sabe cómo terminó: solo errores del cliente (400 a 499, salvo 429)
      res.on('finish', () => {
        if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) sumar(k);
      });
    } else {
      sumar(k);
    }
    return next();
  };
}

const minusculas = (v) => String(v || '').trim().toLowerCase();

module.exports = { crearLimitador, minusculas };
