const db = require('../config/db');

/*
 * Versión de sesión por usuario (columna usuario.sesion_version).
 * Cada token lleva la versión vigente al iniciar sesión (campo "sv"). Al cambiar la contraseña
 * la versión sube y todos los tokens anteriores dejan de valer, en cualquier dispositivo.
 * Se guarda un rato en memoria para no consultar la base en cada pedido; al invalidar se borra
 * de la memoria, así que en este mismo servidor el corte es inmediato.
 */
const DURACION_CACHE_MS = 15 * 1000;
const cache = new Map();

/** Versión vigente del usuario, o null si el usuario ya no existe. */
async function versionActual(idUsuario) {
  const id = Number(idUsuario);
  const guardada = cache.get(id);
  if (guardada && guardada.hasta > Date.now()) return guardada.version;

  const [rows] = await db.query('SELECT sesion_version FROM usuario WHERE idUsuario = ?', [id]);
  const version = rows.length ? Number(rows[0].sesion_version) || 0 : null;
  cache.set(id, { version, hasta: Date.now() + DURACION_CACHE_MS });
  return version;
}

/** Corta todas las sesiones abiertas del usuario. Devuelve la versión nueva. */
async function invalidarSesiones(idUsuario, conexion = db) {
  const id = Number(idUsuario);
  await conexion.query('UPDATE usuario SET sesion_version = sesion_version + 1 WHERE idUsuario = ?', [id]);
  const [rows] = await conexion.query('SELECT sesion_version FROM usuario WHERE idUsuario = ?', [id]);
  cache.delete(id);
  return Number(rows[0]?.sesion_version) || 0;
}

/** Para usar después de confirmar una transacción que cambió la versión. */
function olvidarVersion(idUsuario) {
  cache.delete(Number(idUsuario));
}

module.exports = { versionActual, invalidarSesiones, olvidarVersion };
