const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { tipoExiste } = require('../functions/tiposClase');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const COLUMNAS = `idTurnoHorario, tipoPlan, turno, etiqueta,
  TIME_FORMAT(horaInicio, '%H:%i') AS horaInicio, TIME_FORMAT(horaFin, '%H:%i') AS horaFin`;

// Valida y limpia lo que llega del navegador (nunca se usa tal cual). Devuelve { datos } o { problema }.
async function leerHorario(body) {
  const tipoPlan = String(body?.tipoPlan ?? '');
  const turno = String(body?.turno ?? '').trim();
  const etiqueta = String(body?.etiqueta ?? '').trim();
  const horaInicio = String(body?.horaInicio ?? '').slice(0, 5);
  const horaFin = String(body?.horaFin ?? '').slice(0, 5);

  if (!(await tipoExiste(tipoPlan, { soloActivos: true }))) return { problema: 'Elegí un tipo de clase válido.' };
  if (turno.length < 2 || turno.length > 50) return { problema: 'El nombre del turno tiene que tener entre 2 y 50 caracteres.' };
  if (etiqueta.length > 60) return { problema: 'La aclaración puede tener hasta 60 caracteres.' };
  if (!HORA.test(horaInicio) || !HORA.test(horaFin)) return { problema: 'Elegí la hora de inicio y de fin.' };
  if (horaInicio >= horaFin) return { problema: 'La hora de fin tiene que ser posterior a la de inicio.' };
  return { datos: { tipoPlan, turno, etiqueta: etiqueta || null, horaInicio, horaFin } };
}

/**
 * GET /api/turnos/horarios?tipoPlan=ClaseCross
 * Lista de horarios de los turnos, ordenada por hora. Sin tipoPlan devuelve todos.
 */
exports.listar = asyncHandler(async (req, res) => {
  const { tipoPlan } = req.query;
  if (tipoPlan !== undefined && !(await tipoExiste(String(tipoPlan)))) {
    return errorResponse(res, 'El tipo de clase no es válido.', 'VALIDATION_ERROR', 400);
  }
  const [filas] = tipoPlan
    ? await db.query(`SELECT ${COLUMNAS} FROM turno_horario WHERE tipoPlan = ? ORDER BY horaInicio, horaFin`, [tipoPlan])
    : await db.query(`SELECT ${COLUMNAS} FROM turno_horario ORDER BY tipoPlan, horaInicio, horaFin`);
  return successResponse(res, 'Horarios de turnos obtenidos correctamente', filas);
});

/**
 * GET /api/turnos/publicos  (sin sesión: lo usa la portada)
 * Horarios de los turnos del box agrupados por tipo de clase. Solo tipos activos y solo datos que ya son públicos
 * (nombre del tipo, turno, aclaración y horas): nada de personas ni de cuentas.
 */
exports.publicos = asyncHandler(async (req, res) => {
  const [filas] = await db.query(`
    SELECT t.codigo, t.nombre AS tipo, h.turno, h.etiqueta,
           TIME_FORMAT(h.horaInicio, '%H:%i') AS horaInicio, TIME_FORMAT(h.horaFin, '%H:%i') AS horaFin
      FROM tipo_clase t
      INNER JOIN turno_horario h ON h.tipoPlan = t.codigo
     WHERE t.activo = 1
     ORDER BY t.idTipoClase, h.horaInicio, h.horaFin`);
  const tipos = [];
  for (const f of filas) {
    let t = tipos.find((x) => x.codigo === f.codigo);
    if (!t) { t = { codigo: f.codigo, nombre: f.tipo, horarios: [] }; tipos.push(t); }
    t.horarios.push({ turno: f.turno, etiqueta: f.etiqueta, horaInicio: f.horaInicio, horaFin: f.horaFin });
  }
  return successResponse(res, 'Horarios de turnos obtenidos correctamente', tipos);
});

/** POST /api/turnos/horarios */
exports.crear = asyncHandler(async (req, res) => {
  const { datos, problema } = await leerHorario(req.body);
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  try {
    const [r] = await db.query(
      'INSERT INTO turno_horario (tipoPlan, turno, etiqueta, horaInicio, horaFin) VALUES (?, ?, ?, ?, ?)',
      [datos.tipoPlan, datos.turno, datos.etiqueta, datos.horaInicio, datos.horaFin]
    );
    const [[fila]] = await db.query(`SELECT ${COLUMNAS} FROM turno_horario WHERE idTurnoHorario = ?`, [r.insertId]);
    return successResponse(res, 'Horario agregado', fila, 201);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return errorResponse(res, 'Ya existe ese horario en ese tipo de clase.', 'DUPLICATE', 409);
    throw error;
  }
});

/** PUT /api/turnos/horarios/:id */
exports.actualizar = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return errorResponse(res, 'Horario inválido.', 'INVALID_ID', 400);
  const { datos, problema } = await leerHorario(req.body);
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  try {
    const [r] = await db.query(
      'UPDATE turno_horario SET tipoPlan = ?, turno = ?, etiqueta = ?, horaInicio = ?, horaFin = ? WHERE idTurnoHorario = ?',
      [datos.tipoPlan, datos.turno, datos.etiqueta, datos.horaInicio, datos.horaFin, id]
    );
    if (r.affectedRows === 0) return errorResponse(res, 'Horario no encontrado.', 'NOT_FOUND', 404);
    const [[fila]] = await db.query(`SELECT ${COLUMNAS} FROM turno_horario WHERE idTurnoHorario = ?`, [id]);
    return successResponse(res, 'Horario actualizado', fila);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return errorResponse(res, 'Ya existe ese horario en ese tipo de clase.', 'DUPLICATE', 409);
    throw error;
  }
});

/** DELETE /api/turnos/horarios/:id (las clases ya creadas no se tocan) */
exports.borrar = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return errorResponse(res, 'Horario inválido.', 'INVALID_ID', 400);
  const [r] = await db.query('DELETE FROM turno_horario WHERE idTurnoHorario = ?', [id]);
  if (r.affectedRows === 0) return errorResponse(res, 'Horario no encontrado.', 'NOT_FOUND', 404);
  return successResponse(res, 'Horario eliminado');
});
