const db = require('../config/db');
const { crearNotificacion } = require('./notificacion.service');
const { sendMembresiaPorVencerEmail, sendMembresiaVenceEmail } = require('./email.service');

// Días de anticipación del correo "tu membresía vence" (el panel ya muestra "Por vencer"
// y deja renovar desde el día 1 del mes en que vence; ver pagos.controller.js).
const DIAS_AVISO_VENCIMIENTO = 3;

// Registro de avisos ya mandados. El cron corre al iniciar el servidor y cada 24 h:
// sin esto, cada reinicio volvía a mandar el mismo correo.
const CREAR_TABLA_AVISOS = `
  CREATE TABLE IF NOT EXISTS aviso_enviado (
    tipo VARCHAR(40) NOT NULL,
    clave VARCHAR(60) NOT NULL,
    idUsuario INT NULL,
    creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tipo, clave)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

/** Reserva el aviso; devuelve true solo la primera vez para ese (tipo, clave). */
async function primeraVez(tipo, clave, idUsuario) {
  const [r] = await db.query('INSERT IGNORE INTO aviso_enviado (tipo, clave, idUsuario) VALUES (?, ?, ?)', [tipo, clave, idUsuario]);
  return r.affectedRows === 1;
}

/**
 * Aviso a quien tiene una membresía vigente que vence en DIAS_AVISO_VENCIMIENTO días o menos,
 * salvo que ya haya renovado (otra membresía activa que vence después). Una vez por membresía.
 */
async function avisarVencimientosProximos() {
  const [porVencer] = await db.query(`
    SELECT c.idCredito, c.creditosCisponibles AS disponibles,
           DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS vence,
           DATEDIFF(c.fechaVencimiento, CURDATE()) AS dias,
           u.idUsuario, p.correo, p.nombrecompleto, pl.nombre AS plan
    FROM credito c
    JOIN alumno a ON a.idAlumno = c.idAlumno
    JOIN persona p ON p.idPersona = a.idPersona
    JOIN usuario u ON u.idPersona = a.idPersona
    LEFT JOIN pago pg ON pg.idPago = c.idPago
    LEFT JOIN plan pl ON pl.idPlan = pg.idPlan
    WHERE c.estado = 'ACTIVO'
      AND u.estado = 'activo'
      AND c.fechaVencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
      AND NOT EXISTS (
        SELECT 1 FROM credito c2
        WHERE c2.idAlumno = c.idAlumno AND c2.estado = 'ACTIVO'
          AND c2.fechaVencimiento > c.fechaVencimiento
      )
  `, [DIAS_AVISO_VENCIMIENTO]);

  let enviados = 0;
  for (const m of porVencer) {
    if (!(await primeraVez('vencimiento', `credito-${m.idCredito}`, m.idUsuario))) continue;
    const cuando = m.dias <= 0 ? 'hoy' : m.dias === 1 ? 'mañana' : `en ${m.dias} días`;
    crearNotificacion(
      m.idUsuario,
      'credito',
      'Tu membresía vence pronto',
      `Tu membresía vence ${cuando}. Renovala para seguir reservando clases.`,
      '/alumno/creditos'
    );
    if (m.correo) {
      await sendMembresiaVenceEmail(m.correo, m.nombrecompleto || 'Alumno', {
        plan: m.plan, fechaVencimiento: m.vence, diasRestantes: m.dias, creditosDisponibles: m.disponibles,
      }).catch(() => {});
    }
    enviados++;
  }
  if (enviados > 0) console.log(`[Cron Membresías] Aviso de vencimiento enviado a ${enviados} alumno(s).`);
}

async function procesarMembresias() {
  console.log('[Cron Membresías] Ejecutando...');
  try {
    await db.query(CREAR_TABLA_AVISOS);
    await avisarVencimientosProximos();

    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;

    // Recordatorio de pago: días 1-9, a alumnos sin membresía vigente. Una vez por mes.
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

      let avisados = 0;
      for (const u of porVencer) {
        if (!(await primeraVez('recordatorio_pago', `${u.idUsuario}-${mes}`, u.idUsuario))) continue;
        avisados++;
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

      if (avisados > 0) {
        console.log(`[Cron Membresías] Recordatorio de pago enviado a ${avisados} alumno(s) — faltan ${diasRestantes} días para el 10.`);
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
