const db = require('../config/db');

// Días sin iniciar sesión ni reservar para que una cuenta de alumno pase a inactiva (≈ 2 meses).
const DIAS_INACTIVIDAD = 60;
const CADA_MS = 24 * 60 * 60 * 1000; // una vez por día

/**
 * Pasa a "inactivo" a los alumnos CON cuenta que no iniciaron sesión ni reservaron en DIAS_INACTIVIDAD días.
 * - Solo cuentas con acceso: los alumnos cargados sin cuenta no tienen contraseña y no entran al cálculo.
 * - Solo alumnos: administradores y profesores no se desactivan por inactividad (evita dejar el box sin admin).
 * - Actividad = último inicio de sesión o última reserva. Si nunca hubo, cuenta desde la fecha de alta.
 * - Un usuario inactivo no puede iniciar sesión (ver auth.controller: CUENTA_INACTIVA); lo reactiva un administrador.
 */
async function desactivarCuentasInactivas() {
  const [r] = await db.query(`
    UPDATE usuario u
    JOIN perfil pf ON pf.idPerfil = u.idPerfil
    JOIN alumno a ON a.idPersona = u.idPersona
    JOIN persona p ON p.idPersona = u.idPersona
    SET u.estado = 'inactivo'
    WHERE u.estado = 'activo'
      AND TRIM(pf.nombrePerfil) = 'Alumno'
      AND u.contrasena IS NOT NULL
      AND COALESCE(
            NULLIF(GREATEST(
              COALESCE(u.ultimoAcceso, '1000-01-01'),
              COALESCE((SELECT MAX(r.fechaReserva) FROM reserva r WHERE r.idAlumno = a.idAlumno), '1000-01-01')
            ), '1000-01-01'),
            p.fecha_registro
          ) < DATE_SUB(NOW(), INTERVAL ? DAY)
  `, [DIAS_INACTIVIDAD]);
  if (r.affectedRows > 0) console.log(`[Cron] Cuentas pasadas a inactivas por falta de uso: ${r.affectedRows}`);
  return r.affectedRows;
}

function iniciarCronInactividad() {
  const correr = () => desactivarCuentasInactivas().catch((e) => console.error('[Cron inactividad]', e.sqlMessage || e.message));
  correr();
  setInterval(correr, CADA_MS);
  console.log(`[Cron] Inactividad de cuentas iniciado (${DIAS_INACTIVIDAD} días, revisión diaria)`);
}

module.exports = { iniciarCronInactividad, desactivarCuentasInactivas, DIAS_INACTIVIDAD };
