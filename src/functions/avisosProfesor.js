const db = require('../config/db');
const { crearNotificacion, getIdUsuarioPorProfesor } = require('./notificacion.service');

// Avisos de la bandeja del profesor. Sus tipos empiezan con "profesor_": la campanita del alumno no los muestra
// y la bandeja del profesor solo muestra estos (GET /notificaciones?tipos=profesor).
const TIPOS = {
  reserva: 'profesor_reserva',
  rutina: 'profesor_rutina',
  listaGuardada: 'profesor_lista_guardada',
  faltaLista: 'profesor_falta_lista',
};

// Ya existe un aviso igual para ese usuario (un aviso por clase y día, no uno por alumno)
async function yaAvisado(idUsuario, tipo, link) {
  const [rows] = await db.query(
    'SELECT 1 FROM notificacion WHERE idUsuario = ? AND tipo = ? AND link = ? LIMIT 1',
    [idUsuario, tipo, link]
  );
  return rows.length > 0;
}

// Avisa al profesor dueño de la clase. Falla en silencio: no debe romper la operación que lo originó.
async function avisarProfesorDeClase(idClase, tipo, titulo, mensaje, link = null, unaVez = false) {
  try {
    const [rows] = await db.query('SELECT idProfesor FROM diaclase WHERE idClase = ?', [idClase]);
    const idUsuario = await getIdUsuarioPorProfesor(rows[0]?.idProfesor);
    if (!idUsuario) return;
    if (unaVez && link && (await yaAvisado(idUsuario, tipo, link))) return;
    await crearNotificacion(idUsuario, tipo, titulo, mensaje, link);
  } catch (err) {
    console.error('Error al avisar al profesor:', err.message);
  }
}

// Clases que ya terminaron con reservas sin tomar lista: un aviso por clase y día
async function avisarListasPendientes() {
  try {
    const [filas] = await db.query(
      `SELECT DISTINCT h.idHorario, h.idClase, c.nombreClase, c.idProfesor,
              DATE_FORMAT(h.fechaEspecifica, '%Y-%m-%d') AS fecha, h.horaInicio
       FROM horarioclase h
       INNER JOIN diaclase c ON c.idClase = h.idClase
       INNER JOIN reserva r ON r.idHorario = h.idHorario AND r.fechaReserva = h.fechaEspecifica AND r.estado = 'proxima'
       LEFT JOIN asistencia a ON a.idReserva = r.idReserva
       WHERE TIMESTAMP(h.fechaEspecifica, h.horaFin) < NOW()
         AND h.fechaEspecifica >= CURDATE() - INTERVAL 1 DAY
         AND a.idAsistencia IS NULL`
    );
    for (const f of filas) {
      const link = `/profesor?clase=${f.idClase}-${f.idHorario}-${f.fecha}`;
      await avisarProfesorDeClase(
        f.idClase,
        TIPOS.faltaLista,
        'Falta tomar lista',
        `Terminó "${f.nombreClase}" de las ${String(f.horaInicio).slice(0, 5)} y todavía no tomaste la lista.`,
        link,
        true
      );
    }
  } catch (err) {
    console.error('Error al revisar listas pendientes:', err.message);
  }
}

// Revisa cada 10 minutos (igual que el resto de los avisos, no demora ninguna respuesta)
function iniciarAvisosProfesor() {
  setInterval(avisarListasPendientes, 10 * 60 * 1000);
  console.log('[Cron] Avisos de listas pendientes iniciado (intervalo: 10 min)');
}

module.exports = { TIPOS, avisarProfesorDeClase, avisarListasPendientes, iniciarAvisosProfesor };
