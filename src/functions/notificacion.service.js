const db = require('../config/db');
const { enviarPush } = require('./push.service');

/**
 * Crea una notificación para un usuario específico.
 * Falla silenciosamente para no romper el flujo principal.
 *
 * push (opcional): además la manda al celular como notificación push. Solo las notificaciones
 * que lo traen llegan al teléfono. Su texto se ve con el teléfono bloqueado, así que va sin
 * datos sensibles: { cuerpo, titulo? } (la pantalla que abre es el mismo link de la notificación).
 */
async function crearNotificacion(idUsuario, tipo, titulo, mensaje, link = null, push = null) {
  try {
    await db.query(
      'INSERT INTO notificacion (idUsuario, tipo, titulo, mensaje, link) VALUES (?, ?, ?, ?, ?)',
      [idUsuario, tipo, titulo, mensaje, link]
    );
  } catch (err) {
    console.error('Error al crear notificación:', err.message);
    return;
  }
  if (push) enviarPush(idUsuario, { ...push, url: push.url ?? link }); // sin await: no demora la respuesta
}

/**
 * Crea una notificación para todos los administradores (idPerfil = 1).
 */
async function crearNotificacionAdmins(tipo, titulo, mensaje, link = null, push = null) {
  try {
    // Administradores = perfiles con permiso de modificar usuarios (los perfiles se crean
    // desde el panel, así que no se puede depender de un id fijo como el 1).
    const [admins] = await db.query(
      `SELECT DISTINCT u.idUsuario
       FROM usuario u
       LEFT JOIN perfilpermiso pp ON pp.idPerfil = u.idPerfil
       LEFT JOIN permiso p ON p.idPermiso = pp.idPermiso
       WHERE u.estado = 'activo'
         AND (u.idPerfil = 1 OR (LOWER(p.modulo) = 'usuarios' AND LOWER(p.accion) = 'modificacion'))`
    );
    for (const admin of admins) {
      await crearNotificacion(admin.idUsuario, tipo, titulo, mensaje, link, push);
    }
  } catch (err) {
    console.error('Error al notificar admins:', err.message);
  }
}

/**
 * Obtiene el idUsuario de un alumno a partir del idReserva.
 */
async function getIdUsuarioPorReserva(idReserva) {
  const [rows] = await db.query(
    `SELECT u.idUsuario FROM reserva r
     INNER JOIN alumno a ON r.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     WHERE r.idReserva = ?`,
    [idReserva]
  );
  return rows[0]?.idUsuario || null;
}

/**
 * Obtiene el idUsuario de un alumno a partir del idCredito.
 */
async function getIdUsuarioPorCredito(idCredito) {
  const [rows] = await db.query(
    `SELECT u.idUsuario FROM credito c
     INNER JOIN alumno a ON c.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     WHERE c.idCredito = ?`,
    [idCredito]
  );
  return rows[0]?.idUsuario || null;
}

/**
 * Obtiene el idUsuario del profesor a partir del idProfesor.
 */
async function getIdUsuarioPorProfesor(idProfesor) {
  const [rows] = await db.query(
    `SELECT u.idUsuario FROM profesor p
     INNER JOIN usuario u ON p.idPersona = u.idPersona
     WHERE p.idProfesor = ?`,
    [idProfesor]
  );
  return rows[0]?.idUsuario || null;
}

/**
 * Notifica a todos los alumnos con reservas activas en una clase.
 */
async function notificarAlumnosDeClase(idClase, tipo, titulo, mensaje, link = null, push = null) {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT u.idUsuario FROM reserva r
       INNER JOIN alumno a ON r.idAlumno = a.idAlumno
       INNER JOIN usuario u ON a.idPersona = u.idPersona
       INNER JOIN horarioclase hc ON r.idHorario = hc.idHorario
       WHERE hc.idClase = ? AND r.estado = 'proxima'`,
      [idClase]
    );
    for (const row of rows) {
      await crearNotificacion(row.idUsuario, tipo, titulo, mensaje, link, push);
    }
  } catch (err) {
    console.error('Error al notificar alumnos de clase:', err.message);
  }
}

/**
 * Crea la tabla notificacion si no existe (ejecutar una vez al arrancar).
 */
async function crearTablaNotificacion() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notificacion (
      idNotificacion INT AUTO_INCREMENT PRIMARY KEY,
      idUsuario INT NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      titulo VARCHAR(150) NOT NULL,
      mensaje TEXT NOT NULL,
      link VARCHAR(255) NULL,
      leida TINYINT(1) DEFAULT 0,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idUsuario) REFERENCES usuario(idUsuario) ON DELETE CASCADE
    )
  `);
  // Agregar columna si la tabla ya existía sin ella
  try {
    await db.query(`ALTER TABLE notificacion ADD COLUMN link VARCHAR(255) NULL AFTER mensaje`);
  } catch { /* columna ya existe */ }
}

module.exports = {
  crearNotificacion,
  crearNotificacionAdmins,
  getIdUsuarioPorReserva,
  getIdUsuarioPorCredito,
  getIdUsuarioPorProfesor,
  notificarAlumnosDeClase,
  crearTablaNotificacion,
};
