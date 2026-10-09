const db = require('../config/db');

/**
 * Constancia de lo que cada persona aceptó (términos, compra, datos de salud).
 * Sirve como prueba ante un reclamo: quién, qué versión de los textos, cuándo y desde qué conexión.
 * Si se modifican los textos legales del frontend (src/app/legal), subir esta versión.
 */
const VERSION_LEGAL = '2026-10-09';

const TIPOS = ['terminos_y_privacidad', 'compra', 'datos_salud'];

const CREAR_TABLA_CONSENTIMIENTO = `
  CREATE TABLE IF NOT EXISTS consentimiento (
    idConsentimiento INT AUTO_INCREMENT PRIMARY KEY,
    idUsuario INT NULL,
    tipo ENUM('terminos_y_privacidad','compra','datos_salud') NOT NULL,
    version VARCHAR(20) NOT NULL,
    detalle VARCHAR(255) NULL,
    ip VARCHAR(45) NULL,
    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_consentimiento_usuario (idUsuario)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const CREAR_TABLA_ARREPENTIMIENTO = `
  CREATE TABLE IF NOT EXISTS solicitud_arrepentimiento (
    idSolicitud INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    dni VARCHAR(10) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30) NULL,
    fechaCompra DATE NULL,
    detalle VARCHAR(500) NULL,
    estado ENUM('pendiente','resuelta','rechazada') DEFAULT 'pendiente',
    ip VARCHAR(45) NULL,
    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function crearTablasLegales() {
  await db.query(CREAR_TABLA_CONSENTIMIENTO);
  await db.query(CREAR_TABLA_ARREPENTIMIENTO);
}

/** El cliente solo "sugiere" que aceptó: se exige el valor exacto true (JSON) o 'true' (formulario). */
function acepto(valor) {
  return valor === true || valor === 'true';
}

async function registrarConsentimiento(conexion, { idUsuario, tipo, detalle = null, ip = null }) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de consentimiento desconocido: ${tipo}`);
  await (conexion || db).query(
    'INSERT INTO consentimiento (idUsuario, tipo, version, detalle, ip) VALUES (?, ?, ?, ?, ?)',
    [idUsuario || null, tipo, VERSION_LEGAL, detalle ? String(detalle).slice(0, 255) : null, ip ? String(ip).slice(0, 45) : null]
  );
}

module.exports = { VERSION_LEGAL, crearTablasLegales, acepto, registrarConsentimiento };
