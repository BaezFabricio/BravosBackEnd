const db = require('../config/db');
const { sendClaseDisponibleEmail } = require('./email.service');

async function procesarClasesListas() {
  try {
    // Buscar clases cuya fecha de publicación ya llegó y aún no se notificó
    const [clases] = await db.query(`
      SELECT
        d.idClase,
        d.nombreClase,
        d.fechaPublicacion,
        hc.horaInicio,
        hc.fechaEspecifica,
        hc.dia AS diasSemana,
        per.nombrecompleto AS nombreProfesor
      FROM diaclase d
      LEFT JOIN horarioclase hc ON hc.idClase = d.idClase
      LEFT JOIN profesor prof ON prof.idProfesor = d.idProfesor
      LEFT JOIN persona per ON per.idPersona = prof.idPersona
      WHERE d.fechaPublicacion IS NOT NULL
        AND d.fechaPublicacion <= NOW()
        AND d.emailEnviado = 0
        AND d.estado = 'Activo'
    `);

    if (clases.length === 0) return;

    // Obtener todos los alumnos activos (sin filtro de membresía para mayor alcance)
    const [alumnos] = await db.query(`
      SELECT DISTINCT
        per.correo,
        per.nombrecompleto AS nombre
      FROM alumno a
      JOIN usuario u ON a.idPersona = u.idPersona
      JOIN persona per ON per.idPersona = a.idPersona
      WHERE u.estado = 'activo'
        AND per.correo IS NOT NULL
        AND per.correo != ''
    `);

    if (alumnos.length === 0) return;

    // Agrupar por clase (puede haber múltiples rows por clase si tiene varios horarios)
    const clasesUnicas = {};
    for (const row of clases) {
      if (!clasesUnicas[row.idClase]) clasesUnicas[row.idClase] = row;
    }

    for (const clase of Object.values(clasesUnicas)) {
      let enviados = 0;

      for (const alumno of alumnos) {
        const nombre = alumno.nombre || 'Alumno';
        try {
          await sendClaseDisponibleEmail(alumno.correo, nombre, clase);
          enviados++;
        } catch (err) {
          console.error(`[Cron] Error enviando a ${alumno.correo}:`, err.message);
        }
      }

      await db.query('UPDATE diaclase SET emailEnviado = 1 WHERE idClase = ?', [clase.idClase]);
      console.log(`[Cron] "${clase.nombreClase}" notificada — ${enviados}/${alumnos.length} emails enviados.`);
    }
  } catch (err) {
    console.error('[Cron] Error en publicacionCron:', err.message);
  }
}

function iniciarCronPublicacion() {
  // Revisar cada 60 segundos
  setInterval(procesarClasesListas, 60 * 1000);
  // También correr al arrancar para notificar clases que quedaron pendientes
  procesarClasesListas();
  console.log('[Cron] Cron de publicación de clases iniciado (intervalo: 60s)');
}

module.exports = { iniciarCronPublicacion };
