const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * POST /api/vv1/reservas
 * Crea una reserva restando cupo y validando permisos dinámicos
 */
exports.crearReserva = asyncHandler(async (req, res) => {
  const idUsuarioReal = req.user?.idUsuario;
  const idPerfilReal = req.user?.idPerfil;
  const { idHorario, fechaReserva } = req.body; // fechaReserva esperado YYYY-MM-DD

  if (!idHorario || !fechaReserva) {
    return errorResponse(res, 'El horario y la fecha son obligatorios.', 'MISSING_FIELDS', 400);
  }

  // 1. 🛡️ VERIFICACIÓN DINÁMICA: ¿El perfil del usuario tiene acceso al módulo Clases/Reservas?
  const sqlValidarPermiso = `
    SELECT COUNT(*) as puedeReservar
    FROM perfilpermiso pp
    INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
    WHERE pp.idPerfil = ? AND LOWER(p.modulo) IN ('clases', 'reservas')
  `;
  const [permisoCheck] = await db.query(sqlValidarPermiso, [idPerfilReal]);
  
  if (!permisoCheck || permisoCheck[0].puedeReservar === 0) {
    return errorResponse(res, 'No tenés permisos de alumno para realizar reservas.', 'FORBIDDEN', 403);
  }

  // 2. 🧱 INICIAMOS TRANSACCIÓN NATIVA (Previene fallos concurrentes de cupos)
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Buscar la clase y sus cupos bloqueando la fila para actualización temporal
    const sqlBuscarClase = `
      SELECT c.idClase, c.cupoDisponible, c.nombreClase, c.estado
      FROM horarioclase h
      INNER JOIN diaclase c ON h.idClase = c.idClase
      WHERE h.idHorario = ? FOR UPDATE
    `;
    const [claseRows] = await connection.query(sqlBuscarClase, [idHorario]);

    if (claseRows.length === 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'La clase o el horario seleccionado no existen.', 'NOT_FOUND', 404);
    }

    const clase = claseRows[0];

    if (clase.estado !== 'Activo') {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'No podés reservar una clase que no está activa.', 'INACTIVE_CLASS', 400);
    }

    if (clase.cupoDisponible <= 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Disculpas, no quedan cupos disponibles para esta clase.', 'NO_CUPO', 400);
    }

    // Buscar el idAlumno correspondiente a la persona vinculada al usuario
    const sqlObtenerAlumno = `
      SELECT a.idAlumno 
      FROM usuario u
      INNER JOIN alumno a ON u.idPersona = a.idPersona
      WHERE u.idUsuario = ?
    `;
    const [alumnoRows] = await connection.query(sqlObtenerAlumno, [idUsuarioReal]);
    
    if (alumnoRows.length === 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'No se encontró tu ficha de alumno asociada al usuario.', 'ALUMNO_NOT_FOUND', 404);
    }
    const idAlumno = alumnoRows[0].idAlumno;

    // Verificar si ya tiene una reserva activa para ese mismo horario y fecha
    const [yaReservado] = await connection.query(
      "SELECT idReserva FROM reserva WHERE idAlumno = ? AND idHorario = ? AND fechaReserva = ? AND estado = 'proxima'",
      [idAlumno, idHorario, fechaReserva]
    );

    if (yaReservado.length > 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Ya tenés una reserva activa para esta misma clase.', 'DUPLICATE_RESERVA', 400);
    }

    // 3. 📝 EJECUTAMOS LAS OPERACIONES
    const horaActual = new Date().toLocaleTimeString('es-AR', { hour12: false });
    
    // Insertar la reserva
    const [reservaResult] = await connection.query(
      "INSERT INTO reserva (fechaReserva, horaReserva, estado, idAlumno, idHorario) VALUES (?, ?, 'proxima', ?, ?)",
      [fechaReserva, horaActual, idAlumno, idHorario]
    );

    // Restar 1 al cupo disponible de la clase
    await connection.query(
      "UPDATE diaclase SET cupoDisponible = cupoDisponible - 1 WHERE idClase = ?",
      [clase.idClase]
    );

    // TODO: Si manejás créditos en la tabla 'alumno' o 'usuario', acá meterías el UPDATE para descontarlo.

    await connection.commit();
    connection.release();

    return successResponse(res, '¡Reserva confirmada con éxito!', {
      idReserva: reservaResult.insertId,
      nombreClase: clase.nombreClase,
      fechaReserva,
      idHorario
    }, 201);

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("Error crítico en transacción de reserva:", error);
    return errorResponse(res, 'Ocurrió un error al procesar tu reserva.', 'RESERVA_FAILED', 500);
  }
});

/**
 * GET /api/vv1/reservas/mis-reservas
 * Recupera las reservas y el historial del alumno autenticado
 */
exports.obtenerMisReservas = asyncHandler(async (req, res) => {
  const idUsuarioLogueado = req.user.idUsuario || req.user.id; 

  if (!idUsuarioLogueado) {
    return errorResponse(res, 'No se pudo identificar al usuario desde el token.', 401);
  }

  // 🟢 Query corregida con los JOINs correspondientes para el Profesor de la clase agendada
  const query = `
    SELECT 
      r.idReserva,
      r.fechaReserva,
      r.horaReserva,
      r.estado AS estadoReserva, 
      h.horaInicio,
      h.horaFin,
      h.dia,
      c.nombreClase,
      c.tipoClase,
      per_prof.nombrecompleto AS nombreProfesor
    FROM reserva r
    INNER JOIN alumno a ON r.idAlumno = a.idAlumno
    INNER JOIN usuario u ON a.idPersona = u.idPersona
    INNER JOIN horarioclase h ON r.idHorario = h.idHorario
    INNER JOIN diaclase c ON h.idClase = c.idClase
    LEFT JOIN profesor prof ON c.idProfesor = prof.idProfesor
    LEFT JOIN persona per_prof ON prof.idPersona = per_prof.idPersona
    WHERE u.idUsuario = ? 
    ORDER BY r.fechaReserva DESC, h.horaInicio DESC -- Ordenamos por las más recientes primero
  `;

  const [misReservas] = await db.query(query, [idUsuarioLogueado]);

  return successResponse(res, 'Reservas obtenidas correctamente', misReservas);
});



/**
 * PATCH /api/vv1/reservas/:id/cancelar
 * Cancela una reserva reintegrando el cupo si cumple las 2 horas de anticipación
 */
exports.cancelarReserva = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const idUsuarioReal = req.user?.idUsuario;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Traer los datos de la reserva y validar pertenencia
    const sqlReserva = `
      SELECT r.idReserva, r.fechaReserva, h.horaInicio, r.estado, c.idClase
      FROM reserva r
      INNER JOIN horarioclase h ON r.idHorario = h.idHorario
      INNER JOIN diaclase c ON h.idClase = c.idClase
      INNER JOIN alumno a ON r.idAlumno = a.idAlumno
      INNER JOIN usuario u ON a.idPersona = u.idPersona
      WHERE r.idReserva = ? AND u.idUsuario = ? FOR UPDATE
    `;
    const [resRows] = await connection.query(sqlReserva, [id, idUsuarioReal]);

    if (resRows.length === 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Reserva no encontrada o no pertenece a tu cuenta.', 'NOT_FOUND', 404);
    }

    const reserva = resRows[0];

    if (reserva.estado !== 'proxima') {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Esta reserva ya no se puede cancelar.', 'INVALID_STATE', 400);
    }

    //  VALIDACIÓN DE ANTICIPACIÓN (2 horas de margen)
    const [fechaAño, fechaMes, fechaDia] = reserva.fechaReserva.toISOString().split('T')[0].split('-');
    const [horaH, horaM, horaS] = reserva.horaInicio.split(':');
    
    const fechaClaseTarget = new Date(fechaAño, fechaMes - 1, fechaDia, horaH, horaM, horaS);
    const ahora = new Date();
    
    const diferenciaHoras = (fechaClaseTarget - ahora) / (1000 * 60 * 60);
    let devuelveCredito = true;

    if (diferenciaHoras < 2) {
      devuelveCredito = false; // Penalización por cancelar tarde (mantiene la lógica de tu Front)
    }

    // Actualizar estado de la reserva
    await connection.query("UPDATE reserva SET estado = 'cancelada' WHERE idReserva = ?", [id]);

    // Devolver el cupo a la clase
    await connection.query("UPDATE diaclase SET cupoDisponible = cupoDisponible + 1 WHERE idClase = ?", [reserva.idClase]);

    await connection.commit();
    connection.release();

    return successResponse(res, 'Reserva cancelada correctamente.', {
      idReserva: Number(id),
      devuelveCredito,
      mensaje: devuelveCredito 
        ? "Tu crédito fue devuelto automáticamente." 
        : "Cancelación fuera de término. El crédito no será reintegrado."
    });

    

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("Error al cancelar reserva:", error);
    return errorResponse(res, 'No se pudo procesar la cancelación.', 'CANCEL_FAILED', 500);
  }
});