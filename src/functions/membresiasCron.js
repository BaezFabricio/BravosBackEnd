const db = require('../config/db');
const { crearNotificacion } = require('./notificacion.service');
const { sendMembresiaPorVencerEmail } = require('./email.service');

async function procesarMembresias() {
  console.log('[Cron Membresías] Ejecutando...');
  try {
    const dia = new Date().getDate();

    // Aviso por vencer: días 1-9, enviar email + notificación a alumnos sin membresía activa
    if (dia >= 1 && dia <= 9) {
      const diasRestantes = 10 - dia;
      const [porVencer] = await db.query(`
        SELECT u.idUsuario, p.correo, p.nombrecompleto
        FROM usuario u
        JOIN persona p ON p.idPersona = u.idPersona
        LEFT JOIN alumno a ON a.idPersona = u.idPersona
        WHERE u.estado = 'activo'
          AND NOT EXISTS (
            SELECT 1 FROM credito c
            WHERE c.idAlumno = a.idAlumno
              AND c.estado = 'ACTIVO'
              AND c.fechaVencimiento >= CURDATE()
          )
          AND a.idAlumno IS NOT NULL
      `);

      for (const u of porVencer) {
        crearNotificacion(
          u.idUsuario,
          'sistema',
          'Membresía por vencer',
          `Recordá abonar tu membresía antes del día 10. Te quedan ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}.`,
          '/alumno/creditos'
        );
        if (u.correo) {
          await sendMembresiaPorVencerEmail(u.correo, u.nombrecompleto || 'Alumno', diasRestantes).catch(() => {});
        }
      }

      if (porVencer.length > 0) {
        console.log(`[Cron Membresías] Aviso enviado a ${porVencer.length} alumno(s) — faltan ${diasRestantes} días para el 10.`);
      }
      return;
    }

    // Inactivar: activos sin membresía vigente que además pasaron el día 10 del mes
    // y llevan más de 30 días sin membresía activa
    const [aInactivar] = await db.query(`
      SELECT u.idUsuario
      FROM usuario u
      JOIN persona p ON p.idPersona = u.idPersona
      LEFT JOIN alumno a ON a.idPersona = u.idPersona
      WHERE u.estado = 'activo'
        AND (u.activadoManualEn IS NULL OR u.activadoManualEn < DATE_SUB(NOW(), INTERVAL 60 DAY))
        AND NOT EXISTS (
          SELECT 1 FROM credito c
          WHERE c.idAlumno = a.idAlumno
            AND c.estado = 'ACTIVO'
            AND c.fechaVencimiento >= CURDATE()
        )
        AND (
          -- Nunca pagaron y se registraron hace más de 60 días
          (
            a.idAlumno IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM pago pg WHERE pg.idAlumno = a.idAlumno)
            AND COALESCE(a.fechaAlta, p.fecha_registro) < DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          )
          OR
          -- Pagaron pero el último crédito venció hace más de 60 días
          (
            a.idAlumno IS NOT NULL
            AND EXISTS (SELECT 1 FROM pago pg WHERE pg.idAlumno = a.idAlumno)
            AND (
              SELECT MAX(c2.fechaVencimiento) FROM credito c2 WHERE c2.idAlumno = a.idAlumno
            ) < DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          )
        )
    `);

    for (const u of aInactivar) {
      await db.query(`UPDATE usuario SET estado = 'inactivo' WHERE idUsuario = ?`, [u.idUsuario]);
      crearNotificacion(
        u.idUsuario,
        'sistema',
        'Membresía vencida',
        'No registramos el pago de tu membresía este mes. Tu cuenta fue suspendida. Contactá al box para regularizar.',
        '/alumno/creditos'
      );
    }

    if (aInactivar.length > 0) {
      console.log(`[Cron Membresías] ${aInactivar.length} usuario(s) marcados como inactivos.`);
    }

    // Reactivar: inactivos que ya tienen un crédito ACTIVO vigente
    const [aActivar] = await db.query(`
      SELECT u.idUsuario
      FROM usuario u
      JOIN alumno a ON a.idPersona = u.idPersona
      WHERE u.estado = 'inactivo'
        AND EXISTS (
          SELECT 1 FROM credito c
          WHERE c.idAlumno = a.idAlumno
            AND c.estado = 'ACTIVO'
            AND c.fechaVencimiento >= CURDATE()
        )
    `);

    for (const u of aActivar) {
      await db.query(`UPDATE usuario SET estado = 'activo', activadoManualEn = NULL WHERE idUsuario = ?`, [u.idUsuario]);
      crearNotificacion(
        u.idUsuario,
        'sistema',
        'Cuenta reactivada',
        'Tu membresía está activa. Ya podés reservar clases.',
        '/alumno/creditos'
      );
    }

    if (aActivar.length > 0) {
      console.log(`[Cron Membresías] ${aActivar.length} usuario(s) reactivados.`);
    }
  } catch (err) {
    console.error('[Cron Membresías] Error:', err.message, err.stack);
  }
}

function iniciarCronMembresias() {
  // Revisar una vez por día (cada 24 horas)
  setInterval(procesarMembresias, 24 * 60 * 60 * 1000);
  procesarMembresias();
  console.log('[Cron] Cron de membresías iniciado (intervalo: 24h)');
}

module.exports = { iniciarCronMembresias };
