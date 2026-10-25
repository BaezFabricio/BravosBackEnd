const db = require('../config/db');
const { crearNotificacion, crearNotificacionAdmins, getIdUsuarioPorProfesor, notificarAlumnosDeClase } = require('../functions/notificacion.service');

const obtenerClases = require('../data/Clases/ObtenerClases');
const obtenerClasePorId = require('../data/Clases/ObtenerClasePorId');
const insertarClase = require('../data/Clases/InsertarClase');
const actualizarClase = require('../data/Clases/ActualizarClase');
const actualizarEstadoClase = require('../data/Clases/ActualizarEstadoClase');
const eliminarClase = require('../data/Clases/EliminarClase');
const insertarHorarioClase = require('../data/HorariosClase/InsertarHorarioClase');
const eliminarHorariosPorClase = require('../data/HorariosClase/EliminarHorariosPorClase');
const queryObtenerClasesAlumnos = require('../data/Clases/ObtenerClasesAlumnos');
const queryClasesParaAlumno = require('../data/Clases/ObtenerClasesParaAlumno');

const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { syncEjercicios } = require('./rutinas.controller');

const DIAS_VALIDOS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const CUPO_MAXIMO = 20;
const diaDeFecha = (fecha) => ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][new Date(fecha + 'T12:00:00').getDay()];

/**
 * Revisa los datos de una clase (al crear y al editar). Devuelve el mensaje del problema o null.
 * El cupo es el límite real de reservas: se guarda igual en cupoMaximo y cupoDisponible.
 */
function problemaDeClase({ nombreClase, cupo, estado, idProfesor, idPlan, diasSemana, fechaEspecifica, horaInicio, horaFin }) {
  const nombre = String(nombreClase || '').trim();
  if (nombre.length < 2 || nombre.length > 100) return 'El nombre de la clase tiene que tener entre 2 y 100 caracteres.';
  if (!Number.isInteger(cupo) || cupo < 1 || cupo > CUPO_MAXIMO) return `El cupo tiene que ser un número entre 1 y ${CUPO_MAXIMO}.`;
  if (!['Activo', 'Inactivo'].includes(estado)) return 'El estado tiene que ser Activo o Inactivo.';
  if (!Number.isInteger(Number(idProfesor)) || Number(idProfesor) <= 0) return 'Elegí el coach de la clase.';
  // Toda clase pertenece a un plan: define a quién se le muestra, quién puede reservarla y a quién se avisa
  if (!Number.isInteger(Number(idPlan)) || Number(idPlan) <= 0) return 'Elegí el plan de la clase.';
  const hora = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (!hora.test(String(horaInicio || '')) || !hora.test(String(horaFin || ''))) return 'Elegí la hora de inicio y de fin.';
  if (String(horaInicio).slice(0, 5) >= String(horaFin).slice(0, 5)) return 'La hora de fin tiene que ser posterior a la de inicio.';
  if (fechaEspecifica) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEspecifica)) || Number.isNaN(new Date(fechaEspecifica + 'T12:00:00').getTime())) return 'La fecha de la clase no es válida.';
  } else if (!Array.isArray(diasSemana) || diasSemana.length === 0 || diasSemana.some((d) => !DIAS_VALIDOS.includes(d))) {
    return 'Elegí al menos un día de la semana.';
  }
  return null;
}

/**
 * Crea o actualiza la rutina vinculada a una clase (categoría, nivel, descripción
 * y ejercicios con video). Si `rutina` viene vacío/ausente no hace nada.
 */
async function guardarRutinaDeClase(idClase, idProfesor, nombreClase, rutina) {
  if (!rutina) return;

  const { categoria, nivel, descripcion, ejercicios, publicarEn } = rutina;

  // Si ejercicios es string (HTML de rich text), lo empaquetamos en descripcion
  // como JSON {desc, rutina} para evitar truncar en ejercicio.nombre (VARCHAR)
  let descripcionFinal;
  let ejerciciosArray;

  if (typeof ejercicios === 'string') {
    const contenidoRutina = ejercicios.trim();
    if (contenidoRutina) {
      descripcionFinal = JSON.stringify({ desc: descripcion || '', rutina: contenidoRutina });
    } else {
      descripcionFinal = descripcion || null;
    }
    ejerciciosArray = [];
  } else {
    descripcionFinal = descripcion || null;
    ejerciciosArray = Array.isArray(ejercicios) ? ejercicios : [];
  }

  const tieneContenido = categoria || nivel || descripcionFinal || ejerciciosArray.length > 0;
  if (!tieneContenido) return;

  const [existente] = await db.query('SELECT idRutina FROM rutina WHERE idClase = ?', [idClase]);

  let idRutina;
  if (existente.length > 0) {
    idRutina = existente[0].idRutina;
    await db.query(
      'UPDATE rutina SET nombre = ?, descripcion = ?, nivel = ?, categoria = ?, idProfesor = ? WHERE idRutina = ?',
      [nombreClase, descripcionFinal, nivel || null, categoria || null, idProfesor, idRutina]
    );
  } else {
    const [result] = await db.query(
      'INSERT INTO rutina (nombre, descripcion, nivel, categoria, idProfesor, idClase) VALUES (?, ?, ?, ?, ?, ?)',
      [nombreClase, descripcionFinal, nivel || null, categoria || null, idProfesor, idClase]
    );
    idRutina = result.insertId;
  }

  await syncEjercicios(idRutina, ejerciciosArray);
}

/**
 * GET /api/clases
 * Obtiene todas las clases agrupadas (Para uso del Panel de Administración)
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [clases] = await db.query(obtenerClases);
  return successResponse(res, 'Clases obtenidas correctamente', clases);
});

/**
 * GET /api/clases/disponibles
 * * Obtiene las clases desglosadas por día/horario individual (Para Reservas de Alumnos)
 */
exports.getClasesDisponibles = asyncHandler(async (req, res) => {
  const [rows] = await db.query(queryObtenerClasesAlumnos);
  return successResponse(res, 'Turnos disponibles obtenidos correctamente', rows);
});

/**
 * GET /api/clases/para-mi
 * Turnos que puede reservar el alumno que consulta: solo los de los planes que tiene vigentes.
 * El alumno sale del token; no se acepta ningún id del pedido.
 */
exports.getClasesParaMi = asyncHandler(async (req, res) => {
  const [rows] = await db.query(queryClasesParaAlumno, [req.user.idUsuario]);
  return successResponse(res, 'Turnos de tu plan obtenidos correctamente', rows);
});

/**
 * GET /api/clases/turnos/resumen
 * Agrupa los turnos realmente usados en horarioclase (no hay tabla maestra de turnos,
 * "turno" es un texto libre por horario) junto con su rango horario real y cuántos
 * horarios de clase lo usan.
 */
exports.getTurnosResumen = asyncHandler(async (req, res) => {
  const [turnos] = await db.query(`
    SELECT
      h.turno AS nombre,
      MIN(h.horaInicio) AS horaInicio,
      MAX(h.horaFin) AS horaFin,
      COUNT(*) AS cantidadHorarios,
      COUNT(DISTINCT h.idClase) AS cantidadClases
    FROM horarioclase h
    WHERE h.turno IS NOT NULL AND h.turno != ''
    GROUP BY h.turno
    ORDER BY horaInicio ASC
  `);

  return successResponse(res, 'Turnos obtenidos correctamente', turnos);
});

/**
 * GET /api/clases/:id
 * Obtiene una clase por ID
 */
/**
 * Reglas para cambiar una clase entre "todas las semanas" y "un solo día". Devuelve, para cada cambio, el motivo
 * por el que NO se puede (o null si se puede). Las usan la pantalla de editar (para avisar antes) y el guardado.
 */
async function restriccionesDeTipo(idClase) {
  const [horarios] = await db.query(
    "SELECT idHorario, DATE_FORMAT(fechaEspecifica, '%Y-%m-%d') AS fechaEspecifica FROM horarioclase WHERE idClase = ?", [idClase]
  );
  const unico = horarios.find((h) => h.fechaEspecifica);
  let aRecurrente = null;
  let aUnica = null;
  if (unico) {
    const [[anotados]] = await db.query(
      "SELECT COUNT(*) AS total FROM reserva WHERE idHorario = ? AND estado = 'proxima'", [unico.idHorario]
    );
    if (Number(anotados.total) > 0) aRecurrente = 'Hay alumnos anotados para esa fecha: cancelá sus reservas antes de pasarla a "todas las semanas".';
  } else if (horarios.length) {
    const [[reservas]] = await db.query('SELECT COUNT(*) AS total FROM reserva WHERE idHorario IN (?)', [horarios.map((h) => h.idHorario)]);
    if (Number(reservas.total) > 0) aUnica = 'Esta clase ya tuvo reservas: pasarla a un solo día borraría ese historial. Si necesitás una clase puntual, creá una nueva.';
  }
  return { horarios, unico, aRecurrente, aUnica };
}

exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [clase] = await db.query(obtenerClasePorId, [id]);

  if (clase.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 'NOT_FOUND', 404);
  }

  const [rutinaRows] = await db.query('SELECT * FROM rutina WHERE idClase = ?', [id]);
  let rutina = null;

  if (rutinaRows.length > 0) {
    const [ejercicios] = await db.query(
      'SELECT idEjercicio, nombre, videoUrl, orden FROM ejercicio WHERE idRutina = ? ORDER BY orden ASC',
      [rutinaRows[0].idRutina]
    );
    rutina = { ...rutinaRows[0], ejercicios };
  }

  const { aRecurrente, aUnica } = await restriccionesDeTipo(id);
  return successResponse(res, 'Clase obtuvo correctamente', { ...clase[0], rutina, noSePuedePasarARecurrente: aRecurrente, noSePuedePasarAUnica: aUnica });
});

/**
 * POST /api/clases
 * Crea una nueva clase en diaclase salteándose la tabla gimnasio
 */
exports.insert = asyncHandler(async (req, res) => {
  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idProfesor,
    idPlan,
    diasSemana,
    fechaEspecifica,
    horaInicio,
    horaFin,
    turno,
    rutina,
    fechaPublicacion,
  } = req.body;

  // El cupo es uno solo: el límite real de reservas
  const cupo = Number(cupoMaximo ?? cupoDisponible);
  const problema = problemaDeClase({ nombreClase, cupo, estado, idProfesor, idPlan, diasSemana, fechaEspecifica, horaInicio, horaFin });
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  if (!tipoClase || !turno) {
    return errorResponse(res, 'Faltan el tipo de clase o el turno.', 'VALIDATION_ERROR', 400);
  }

  const esUnica = !!fechaEspecifica;

  const [result] = await db.query(insertarClase, [
    String(nombreClase).trim(),
    tipoClase,
    cupo,
    cupo,
    estado,
    null,
    idProfesor,
    idPlan || null,
    fechaPublicacion || null,
  ]);

  const idClase = result.insertId;

  if (esUnica) {
    // Clase única: almacenamos el día de semana en 'dia' y la fecha exacta en 'fechaEspecifica'
    const diaSemana = ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'][new Date(fechaEspecifica + 'T00:00:00').getDay()];
    await db.query(insertarHorarioClase, [diaSemana, horaInicio, horaFin, turno, idClase, fechaEspecifica]);
  } else {
    for (const dia of diasSemana) {
      await db.query(insertarHorarioClase, [dia, horaInicio, horaFin, turno, idClase, null]);
    }
  }

  await guardarRutinaDeClase(idClase, idProfesor, nombreClase, rutina);

  const idUsuarioProfesor = await getIdUsuarioPorProfesor(idProfesor);
  if (idUsuarioProfesor) {
    // El aviso dice qué clase es, de qué plan y cuándo se da (antes solo decía que se le asignó una clase)
    const [[planClase]] = await db.query('SELECT nombre FROM plan WHERE idPlan = ?', [idPlan || 0]);
    const NOMBRE_DIA = { LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', VIERNES: 'Vie', SABADO: 'Sáb', DOMINGO: 'Dom' };
    const hora = `${String(horaInicio).slice(0, 5)} a ${String(horaFin).slice(0, 5)} h`;
    const cuando = esUnica
      ? `el ${fechaEspecifica.slice(8, 10)}/${fechaEspecifica.slice(5, 7)} de ${hora}`
      : `${diasSemana.map((d) => NOMBRE_DIA[d] || d).join(', ')} de ${hora}`;
    const detalle = `"${nombreClase}"${planClase ? ` · Plan ${planClase.nombre}` : ''} · ${cuando} · cupo ${cupo}`;
    crearNotificacion(idUsuarioProfesor, 'sistema',
      'Nueva clase asignada',
      `Se te asignó la clase ${detalle}. Ya aparece en tu panel de asistencia.`,
      '/profesor/rutinas',
    { propio: true, titulo: 'Nueva clase asignada', cuerpo: `Se te asignó ${detalle}` }
  );
  }
  const cantHorarios = esUnica ? 1 : diasSemana.length;
  crearNotificacionAdmins('sistema', 'Clase creada', `Se creó la clase "${nombreClase}" con ${cantHorarios} horario(s).`, '/admin/clases');

  return successResponse(res, 'Clase creada correctamente con sus horarios', {
    idClase,
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio: null,
    idProfesor,
    esUnica,
    fechaEspecifica: fechaEspecifica || null,
    horarios: esUnica
      ? [{ dia: ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'][new Date(fechaEspecifica + 'T00:00:00').getDay()], horaInicio, horaFin, turno, fechaEspecifica }]
      : diasSemana.map((dia) => ({ dia, horaInicio, horaFin, turno }))
  }, 201);
});

/**
 * PUT /api/clases/:id
 * Actualiza una clase existente forzando NULL en el gimnasio
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idProfesor,
    idPlan,
    diasSemana,
    fechaEspecifica,
    horaInicio,
    horaFin,
    turno,
    rutina,
    fechaPublicacion
  } = req.body;

  // El cupo es uno solo: el límite real de reservas. Antes la pantalla de editar mandaba
  // cupoMaximo = 20 fijo y el número elegido iba a cupoDisponible, así que la clase aceptaba 20.
  const cupo = Number(cupoMaximo ?? cupoDisponible);
  const problema = problemaDeClase({ nombreClase, cupo, estado, idProfesor, idPlan, diasSemana, fechaEspecifica, horaInicio, horaFin });
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  if (!tipoClase || !turno) {
    return errorResponse(res, 'Faltan el tipo de clase o el turno.', 'VALIDATION_ERROR', 400);
  }

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 'NOT_FOUND', 404);
  }

  // Una clase puede pasar de recurrente a sesión única (y al revés) mientras no haya alumnos anotados que se perjudiquen
  const [horariosActuales] = await db.query(
    "SELECT idHorario, dia, DATE_FORMAT(fechaEspecifica, '%Y-%m-%d') AS fechaEspecifica, TIME_FORMAT(horaInicio, '%H:%i') AS hi, TIME_FORMAT(horaFin, '%H:%i') AS hf FROM horarioclase WHERE idClase = ?", [id]
  );
  const horarioUnico = horariosActuales.find((h) => h.fechaEspecifica);

  // Una clase de un solo día se puede editar hasta su hora de fin; después es historial (la hora la da la base, en hora local)
  if (horarioUnico) {
    const [[estado]] = await db.query(
      'SELECT (fechaEspecifica < CURDATE() OR (fechaEspecifica = CURDATE() AND horaFin <= CURTIME())) AS termino FROM horarioclase WHERE idHorario = ?',
      [horarioUnico.idHorario]
    );
    if (Number(estado?.termino) === 1) {
      return errorResponse(res, 'Esta clase ya terminó: no se puede editar.', 'CLASS_ENDED', 409);
    }
  }

  // Si cambia el horario o el coach, se avisa a los alumnos que tienen reservada una clase que todavía no se dio
  const horaAntes = horariosActuales[0] ? { inicio: horariosActuales[0].hi, fin: horariosActuales[0].hf } : null;
  const avisarCambios = async () => {
    const cambios = [];
    const nuevoInicio = String(horaInicio).slice(0, 5);
    const nuevoFin = String(horaFin).slice(0, 5);
    if (horaAntes && (horaAntes.inicio !== nuevoInicio || horaAntes.fin !== nuevoFin)) {
      cambios.push('el horario ahora es de ' + nuevoInicio + ' a ' + nuevoFin + ' (antes ' + horaAntes.inicio + ' a ' + horaAntes.fin + ')');
    }
    if (Number(claseExistente[0].idProfesor) !== Number(idProfesor)) {
      const [[prof]] = await db.query('SELECT per.nombrecompleto AS nombre FROM profesor p INNER JOIN persona per ON p.idPersona = per.idPersona WHERE p.idProfesor = ?', [idProfesor]);
      cambios.push('ahora la da ' + (prof?.nombre || 'otro coach'));
    }
    if (cambios.length === 0) return;
    const nombre = String(nombreClase).trim();
    notificarAlumnosDeClase(Number(id), 'sistema', 'Cambió tu clase',
      'La clase "' + nombre + '" que reservaste tuvo cambios: ' + cambios.join(' y ') + '.',
      '/alumno/reservas',
      { propio: true, cuerpo: 'Cambió tu clase "' + nombre + '": ' + cambios.join(' y ') },
      true
    );
  };
  const pasaARecurrente = Boolean(horarioUnico) && !fechaEspecifica;
  const pasaAUnica = !horarioUnico && Boolean(fechaEspecifica);
  if (pasaARecurrente || pasaAUnica) {
    const { aRecurrente, aUnica } = await restriccionesDeTipo(id);
    const motivo = pasaARecurrente ? aRecurrente : aUnica;
    if (motivo) return errorResponse(res, motivo, 'HAS_RESERVATIONS', 409);
  }
  if (horarioUnico && !pasaARecurrente && fechaEspecifica !== horarioUnico.fechaEspecifica) {
    const [[conReservas]] = await db.query(
      "SELECT COUNT(*) AS total FROM reserva WHERE idHorario = ? AND estado = 'proxima'", [horarioUnico.idHorario]
    );
    if (Number(conReservas.total) > 0) {
      return errorResponse(res, 'La clase ya tiene alumnos anotados: no se le puede cambiar la fecha.', 'HAS_RESERVATIONS', 409);
    }
  }

  const fechaAviso = fechaPublicacion || null;
  await db.query(actualizarClase, [
    fechaAviso,
    String(nombreClase).trim(),
    tipoClase,
    cupo,
    cupo,
    estado,
    null,
    idProfesor,
    idPlan || null,
    fechaAviso,
    id
  ]);

  if (pasaARecurrente) {
    // La sesión única se convierte en el primer día semanal (conserva su historial) y se agregan los demás
    const [primero, ...resto] = diasSemana;
    await db.query(
      'UPDATE horarioclase SET dia = ?, fechaEspecifica = NULL, horaInicio = ?, horaFin = ?, turno = ? WHERE idHorario = ?',
      [primero, horaInicio, horaFin, turno, horarioUnico.idHorario]
    );
    for (const dia of resto) {
      await db.query(insertarHorarioClase, [dia, horaInicio, horaFin, turno, id, null]);
    }
    await guardarRutinaDeClase(id, idProfesor, nombreClase, rutina);
    await avisarCambios();
    return successResponse(res, 'Clase actualizada correctamente', { idClase: Number(id) });
  }

  if (pasaAUnica) {
    await db.query('DELETE FROM horarioclase WHERE idClase = ?', [id]);
    await db.query(insertarHorarioClase, [diaDeFecha(fechaEspecifica), horaInicio, horaFin, turno, id, fechaEspecifica]);
    await guardarRutinaDeClase(id, idProfesor, nombreClase, rutina);
    await avisarCambios();
    return successResponse(res, 'Clase actualizada correctamente', { idClase: Number(id) });
  }

  if (horarioUnico) {
    await db.query(
      'UPDATE horarioclase SET dia = ?, fechaEspecifica = ?, horaInicio = ?, horaFin = ?, turno = ? WHERE idHorario = ?',
      [diaDeFecha(fechaEspecifica), fechaEspecifica, horaInicio, horaFin, turno, horarioUnico.idHorario]
    );
    await guardarRutinaDeClase(id, idProfesor, nombreClase, rutina);
    await avisarCambios();
    return successResponse(res, 'Clase actualizada correctamente', { idClase: Number(id) });
  }

  // Actualizar horarios sin tocar las reservas existentes:
  // - Si el día ya existía → UPDATE (hora/turno)
  // - Si el día es nuevo → INSERT
  // - Si el día fue eliminado y no tiene reservas → DELETE
  // - Si el día fue eliminado pero tiene reservas → no se toca
  const mapaActual = {};
  horariosActuales.forEach(h => { mapaActual[h.dia] = h.idHorario; });

  for (const dia of diasSemana) {
    if (mapaActual[dia]) {
      // Ya existe → solo actualizar hora y turno
      await db.query(
        'UPDATE horarioclase SET horaInicio = ?, horaFin = ?, turno = ? WHERE idHorario = ?',
        [horaInicio, horaFin, turno, mapaActual[dia]]
      );
      delete mapaActual[dia]; // marcar como procesado
    } else {
      // Día nuevo → insertar (sin fecha: es recurrente). Antes faltaba este último dato y
      // agregar un día al editar fallaba siempre.
      await db.query(insertarHorarioClase, [dia, horaInicio, horaFin, turno, id, null]);
    }
  }

  // Los días que quedaron en mapaActual ya no están en el nuevo schedule
  for (const [dia, idHorario] of Object.entries(mapaActual)) {
    const [reservas] = await db.query(
      'SELECT COUNT(*) AS total FROM reserva WHERE idHorario = ?', [idHorario]
    );
    if (reservas[0].total === 0) {
      // Sin reservas → se puede borrar
      await db.query('DELETE FROM horarioclase WHERE idHorario = ?', [idHorario]);
    }
    // Con reservas → se deja como está (el horario queda pero ya no aparece en los días activos)
  }

  await guardarRutinaDeClase(id, idProfesor, nombreClase, rutina);
  await avisarCambios();

  return successResponse(res, 'Clase actualizada correctamente', {
    idClase: Number(id),
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio: null,
    idProfesor,
    horarios: diasSemana.map((dia) => ({
      dia,
      horaInicio,
      horaFin,
      turno
    }))
  });
});

/**
 * PATCH /api/clases/:id/estado
 * Cambia solamente el estado de una clase
 */
exports.updateEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['Activo', 'Inactivo'].includes(estado)) {
    return errorResponse(res, 'El estado tiene que ser Activo o Inactivo.', 'VALIDATION_ERROR', 400);
  }

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 'NOT_FOUND', 404);
  }

  const claseInfo = claseExistente[0];
  await db.query(actualizarEstadoClase, [estado, id]);

  const idUsuarioProfesor = await getIdUsuarioPorProfesor(claseInfo.idProfesor);
  if (idUsuarioProfesor) {
    crearNotificacion(idUsuarioProfesor, 'sistema',
      'Estado de clase actualizado',
      `La clase "${claseInfo.nombreClase}" cambió su estado a "${estado}".`,
      '/profesor/rutinas',
    { cuerpo: `La clase "${claseInfo.nombreClase}" cambió de estado` }
  );
  }
  if (estado === 'Inactivo' || estado === 'Cancelado') {
    notificarAlumnosDeClase(Number(id), 'sistema',
      'Clase cancelada',
      `La clase "${claseInfo.nombreClase}" fue cancelada. Contactá con el box para más información.`,
      '/alumno/reservas',
    { cuerpo: `Se canceló la clase "${claseInfo.nombreClase}" que tenías reservada` }
  );
  }

  return successResponse(res, 'Estado de la clase actualizado correctamente', {
    idClase: Number(id),
    estado
  });
});

/**
 * DELETE /api/clases/:id
 * Elimina una clase y todos sus registros relacionados en cascada
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [claseExistente] = await db.query(obtenerClasePorId, [id]);

  if (claseExistente.length === 0) {
    return errorResponse(res, 'Clase no encontrada', 'NOT_FOUND', 404);
  }

  const claseAEliminar = claseExistente[0];

  // Notificar alumnos con reservas activas ANTES de eliminar
  await notificarAlumnosDeClase(Number(id), 'sistema',
    'Clase eliminada',
    `La clase "${claseAEliminar.nombreClase}" fue eliminada del sistema. Tus reservas asociadas fueron canceladas.`,
    '/alumno/reservas',
    { cuerpo: `Se eliminó la clase "${claseAEliminar.nombreClase}". Tus reservas se cancelaron` }
  );
  const idUsuarioProfesor = await getIdUsuarioPorProfesor(claseAEliminar.idProfesor);
  if (idUsuarioProfesor) {
    crearNotificacion(idUsuarioProfesor, 'sistema',
      'Clase eliminada',
      `La clase "${claseAEliminar.nombreClase}" fue eliminada del sistema.`,
      '/profesor/rutinas',
    { cuerpo: `Se eliminó la clase "${claseAEliminar.nombreClase}"` }
  );
  }

  // Obtener los idHorario de esta clase para poder borrar las reservas asociadas
  const [horarios] = await db.query('SELECT idHorario FROM horarioclase WHERE idClase = ?', [id]);
  const idHorarios = horarios.map(h => h.idHorario);

  if (idHorarios.length > 0) {
    const phHorarios = idHorarios.map(() => '?').join(',');
    const [reservas] = await db.query(`SELECT idReserva FROM reserva WHERE idHorario IN (${phHorarios})`, idHorarios);
    const idReservas = reservas.map(r => r.idReserva);
    if (idReservas.length > 0) {
      const phReservas = idReservas.map(() => '?').join(',');
      await db.query(`DELETE FROM asistencia WHERE idReserva IN (${phReservas})`, idReservas);
    }
    await db.query(`DELETE FROM reserva WHERE idHorario IN (${phHorarios})`, idHorarios);
  }

  await db.query(eliminarHorariosPorClase, [id]);

  // Borrar rutina vinculada (ejercicios cascadean por FK ON DELETE CASCADE)
  await db.query('DELETE FROM rutina WHERE idClase = ?', [id]);

  await db.query(eliminarClase, [id]);

  return successResponse(res, 'Clase eliminada correctamente');
});

// EXPORTS SEGUROS Y UNIFICADOS
module.exports = {
  getAll: exports.getAll,
  getClasesDisponibles: exports.getClasesDisponibles, // 🟢 Ahora sí exportado correctamente
  getClasesParaMi: exports.getClasesParaMi,
  getTurnosResumen: exports.getTurnosResumen,
  getById: exports.getById,
  insert: exports.insert,
  update: exports.update,
  updateEstado: exports.updateEstado,
  delete: exports.delete
};