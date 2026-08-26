const db = require('../config/db');

/**
 * Crea una notificación para un usuario específico.
 * Falla silenciosamente para no romper el flujo principal.
 */
async function crearNotificacion(idUsuario, tipo, titulo, mensaje) {
  try {
    await db.query(
      'INSERT INTO notificacion (idUsuario, tipo, titulo, mensaje) VALUES (?, ?, ?, ?)',
      [idUsuario, tipo, titulo, mensaje]
    );
  } catch (err) {
    console.error('Error al crear notificación:', err.message);
  }
}

/**
 * Crea una notificación para todos los administradores (idPerfil = 1).
 */
async function crearNotificacionAdmins(tipo, titulo, mensaje) {
  try {
    const [admins] = await db.query(
      "SELECT u.idUsuario FROM usuario u WHERE u.idPerfil = 1 AND u.estado = 'activo'"
    );
    for (const admin of admins) {
      await crearNotificacion(admin.idUsuario, tipo, titulo, mensaje);
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
async function notificarAlumnosDeClase(idClase, tipo, titulo, mensaje) {
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
      await crearNotificacion(row.idUsuario, tipo, titulo, mensaje);
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
      leida TINYINT(1) DEFAULT 0,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idUsuario) REFERENCES usuario(idUsuario) ON DELETE CASCADE
    )
  `);
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
