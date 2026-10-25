const db = require('../config/db');
const { sendClaseDisponibleEmail } = require('./email.service');
const { crearNotificacion } = require('./notificacion.service');

const DIAS_TXT = { LUNES: 'lunes', MARTES: 'martes', MIERCOLES: 'miércoles', JUEVES: 'jueves', VIERNES: 'viernes', SABADO: 'sábado', DOMINGO: 'domingo' };
const ORDEN_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const hh = (h) => String(h || '').slice(0, 5);

// "viernes 14 de octubre, de 14:00 a 15:00 hs" (sesión única) o "lunes, miércoles y viernes, de 14:00 a 15:00 hs" (recurrente)
function cuandoSeDicta(horarios) {
  const unico = horarios.find((h) => h.fechaTxt);
  if (unico) {
    const [a, m, d] = unico.fechaTxt.split('-').map(Number);
    const dia = Object.values(DIAS_TXT)[(new Date(a, m - 1, d, 12).getDay() + 6) % 7];
    return `${dia} ${d} de ${MESES[m - 1]}, de ${hh(unico.horaInicio)} a ${hh(unico.horaFin)} hs`;
  }
  const dias = [...horarios].sort((x, y) => ORDEN_DIAS.indexOf(x.dia) - ORDEN_DIAS.indexOf(y.dia));
  const mismaHora = dias.every((h) => hh(h.horaInicio) === hh(dias[0].horaInicio) && hh(h.horaFin) === hh(dias[0].horaFin));
  if (mismaHora) {
    const nombres = dias.map((h) => DIAS_TXT[h.dia] || String(h.dia).toLowerCase());
    const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
    return `${lista}, de ${hh(dias[0].horaInicio)} a ${hh(dias[0].horaFin)} hs`;
  }
  return dias.map((h) => `${DIAS_TXT[h.dia] || h.dia} ${hh(h.horaInicio)}`).join(', ');
}

async function procesarClasesListas() {
  try {
    // Buscar clases cuya fecha de publicación ya llegó y aún no se notificó
    const [clases] = await db.query(`
      SELECT
        d.idClase,
        d.nombreClase,
        d.fechaPublicacion,
        d.idPlan,
        pl.nombre AS nombrePlan,
        hc.horaInicio,
        hc.horaFin,
        DATE_FORMAT(hc.fechaEspecifica, '%Y-%m-%d') AS fechaTxt,
        hc.fechaEspecifica,
        hc.dia AS diasSemana,
        per.nombrecompleto AS nombreProfesor
      FROM diaclase d
      LEFT JOIN horarioclase hc ON hc.idClase = d.idClase
      LEFT JOIN plan pl ON pl.idPlan = d.idPlan
      LEFT JOIN profesor prof ON prof.idProfesor = d.idProfesor
      LEFT JOIN persona per ON per.idPersona = prof.idPersona
      WHERE d.fechaPublicacion IS NOT NULL
        AND d.fechaPublicacion <= NOW()
        AND d.emailEnviado = 0
        AND d.estado = 'Activo'
    `);

    if (clases.length === 0) return;

    // Agrupar por clase (puede haber múltiples rows por clase si tiene varios horarios)
    const clasesUnicas = {};
    for (const row of clases) {
      if (!clasesUnicas[row.idClase]) clasesUnicas[row.idClase] = { ...row, horarios: [] };
      if (row.diasSemana || row.fechaTxt) {
        clasesUnicas[row.idClase].horarios.push({ dia: row.diasSemana, horaInicio: row.horaInicio, horaFin: row.horaFin, fechaTxt: row.fechaTxt });
      }
    }

    for (const clase of Object.values(clasesUnicas)) {
      let enviados = 0;
      if (!clase.idPlan) { // toda clase debería tener plan; si no lo tiene no se le avisa a nadie
        await db.query('UPDATE diaclase SET emailEnviado = 1 WHERE idClase = ?', [clase.idClase]);
        continue;
      }

      // Texto del aviso: qué clase es, de qué plan, cuándo se dicta y quién la da
      const cuando = clase.horarios.length ? cuandoSeDicta(clase.horarios) : '';
      const titulo = clase.nombrePlan ? `Nueva clase de ${clase.nombrePlan}` : 'Nueva clase disponible';
      const mensaje = `"${clase.nombreClase}"${clase.nombrePlan ? ` (${clase.nombrePlan})` : ''}${cuando ? `: ${cuando}` : ''}${clase.nombreProfesor ? `, con ${clase.nombreProfesor}` : ''}. Ya podés reservar tu lugar.`;
      // El push se ve con el celular bloqueado: es información pública de la clase, sin datos personales
      const cuerpoPush = `${clase.nombrePlan ? `${clase.nombrePlan}: ` : ''}"${clase.nombreClase}"${cuando ? `, ${cuando}` : ''}. Ya podés reservar.`;

      // Solo les avisa a los alumnos con membresía VIGENTE del plan de la clase (crédito activo y sin vencer).
      // Un alumno activo pero sin membresía, o con una membresía de otro plan, no recibe nada.
      const [alumnos] = await db.query(`
        SELECT DISTINCT
          u.idUsuario,
          per.correo,
          per.nombrecompleto AS nombre
        FROM credito c
        JOIN alumno a ON a.idAlumno = c.idAlumno
        JOIN usuario u ON u.idPersona = a.idPersona
        JOIN persona per ON per.idPersona = a.idPersona
        JOIN pago pa ON pa.idPago = c.idPago
        WHERE u.estado = 'activo'
          AND c.estado = 'ACTIVO'
          AND c.fechaVencimiento >= CURDATE()
          AND pa.idPlan = ?
      `, [clase.idPlan]);

      for (const alumno of alumnos) {
        const nombre = alumno.nombre || 'Alumno';

        // Notificación en la campanita + push al celular (el texto del push va sin datos sensibles)
        crearNotificacion(alumno.idUsuario, 'sistema', titulo, mensaje, '/alumno/reservar', { propio: true, titulo: 'Nueva clase en Bravos Box', cuerpo: cuerpoPush });

        if (!alumno.correo) continue;
        try {
          await sendClaseDisponibleEmail(alumno.correo, nombre, clase);
          enviados++;
        } catch (err) {
          console.error(`[Cron] Error enviando a ${alumno.correo}:`, err.message);
        }
      }

      await db.query('UPDATE diaclase SET emailEnviado = 1 WHERE idClase = ?', [clase.idClase]);
      console.log(`[Cron] "${clase.nombreClase}" notificada — ${enviados}/${alumnos.length} emails enviados, notificación y push a los alumnos con membresía vigente de su plan.`);
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
