const crypto = require('crypto');
const db = require('../config/db');

/**
 * Recuperación de contraseña con enlace de un solo uso.
 * El token viaja solo en el enlace del correo (32 bytes al azar = 64 caracteres hex): no se puede
 * adivinar probando combinaciones. En la base se guarda únicamente su hash SHA-256, así que quien
 * lea la tabla no puede usarlo. Vence a los 30 minutos y se invalida al usarse o al pedir otro.
 */
const DURACION_MIN = 30;
const ESPERA_ENTRE_PEDIDOS_SEG = 60;

const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
    idRecuperacion INT AUTO_INCREMENT PRIMARY KEY,
    idUsuario INT NOT NULL,
    tokenHash CHAR(64) NOT NULL UNIQUE,
    expiraEn DATETIME NOT NULL,
    usadoEn DATETIME NULL,
    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_recuperacion_usuario (idUsuario)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

async function crearTablaRecuperacion() {
  await db.query(CREAR_TABLA);
}

/** ¿Pidió un enlace hace menos de un minuto? (evita llenarle la casilla de correos a alguien) */
async function pidioHacePoco(idUsuario) {
  const [rows] = await db.query(
    `SELECT 1 FROM recuperacion_contrasena
     WHERE idUsuario = ? AND creadoEn > DATE_SUB(NOW(), INTERVAL ${ESPERA_ENTRE_PEDIDOS_SEG} SECOND)
     LIMIT 1`,
    [idUsuario]
  );
  return rows.length > 0;
}

/** Crea un token nuevo (anulando los anteriores sin usar) y lo devuelve en claro, una sola vez. */
async function crearToken(idUsuario) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    'UPDATE recuperacion_contrasena SET usadoEn = NOW() WHERE idUsuario = ? AND usadoEn IS NULL',
    [idUsuario]
  );
  await db.query(
    `INSERT INTO recuperacion_contrasena (idUsuario, tokenHash, expiraEn)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${DURACION_MIN} MINUTE))`,
    [idUsuario, hashToken(token)]
  );
  return token;
}

/** Datos del token si sigue vigente y sin usar; si no, null. */
async function buscarTokenVigente(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const [rows] = await db.query(
    `SELECT idRecuperacion, idUsuario FROM recuperacion_contrasena
     WHERE tokenHash = ? AND usadoEn IS NULL AND expiraEn > NOW()
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

/** Marca el token como usado. Devuelve false si otro pedido lo usó antes (doble envío). */
async function consumirToken(idRecuperacion, conexion = db) {
  const [r] = await conexion.query(
    'UPDATE recuperacion_contrasena SET usadoEn = NOW() WHERE idRecuperacion = ? AND usadoEn IS NULL',
    [idRecuperacion]
  );
  return r.affectedRows === 1;
}

/** Mismas reglas que el formulario de registro. Devuelve el motivo si no cumple, o null. */
function problemaContrasena(password) {
  const p = String(password || '');
  if (p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (p.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Z]/.test(p)) return 'La contraseña debe tener al menos una letra mayúscula.';
  if (!/[a-z]/.test(p)) return 'La contraseña debe tener al menos una letra minúscula.';
  if (!/[0-9]/.test(p)) return 'La contraseña debe tener al menos un número.';
  return null;
}

module.exports = {
  DURACION_MIN,
  crearTablaRecuperacion,
  pidioHacePoco,
  crearToken,
  buscarTokenVigente,
  consumirToken,
  problemaContrasena,
};
