const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { crearNotificacion, getIdUsuarioPorReserva } = require('../functions/notificacion.service');

/**
 * POST /api/vv1/reservas
 * Crea una reserva restando cupo, validando permisos dinámicos y descontando 1 crédito de alumno
 */
exports.crearReserva = asyncHandler(async (req, res) => {
  const idUsuarioReal = req.user?.idUsuario;
  const idPerfilReal = req.user?.idPerfil;
  const { idHorario, fechaReserva } = req.body; 

  if (!idHorario || !fechaReserva) {
    return errorResponse(res, 'El horario y la fecha son obligatorios.', 'MISSING_FIELDS', 400);
  }

  // 1. 🛡️ VERIFICACIÓN DINÁMICA DE PERMISOS
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

  // 2. 🧱 INICIAMOS TRANSACCIÓN NATIVA
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Buscar la clase y calcular cupos disponibles dinámicamente para la fecha solicitada
    const sqlBuscarClase = `
      SELECT c.idClase, c.cupoMaximo, c.nombreClase, c.estado, c.idPlan,
        (
          c.cupoMaximo - (
            SELECT COUNT(*) FROM reserva r2
            WHERE r2.idHorario = ? AND r2.estado = 'proxima' AND r2.fechaReserva = ?
          )
        ) AS cupoDisponible
      FROM horarioclase h
      INNER JOIN diaclase c ON h.idClase = c.idClase
      WHERE h.idHorario = ? FOR UPDATE
    `;
    const [claseRows] = await connection.query(sqlBuscarClase, [idHorario, fechaReserva, idHorario]);

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

    // Buscar el idAlumno correspondiente al usuario logueado
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

    // Buscar crédito activo del alumno; si la clase tiene idPlan, el crédito debe ser del mismo plan
    let sqlBuscarCredito, creditoParams;
    if (clase.idPlan) {
      sqlBuscarCredito = `
        SELECT c.idCredito, c.creditosCisponibles, c.creditosUtilizados
        FROM credito c
        INNER JOIN pago p ON c.idPago = p.idPago
        WHERE c.idAlumno = ? AND p.idPlan = ? AND c.estado = 'ACTIVO'
          AND c.creditosCisponibles > 0 AND c.fechaVencimiento >= CURDATE()
        ORDER BY c.fechaVencimiento ASC LIMIT 1 FOR UPDATE
      `;
      creditoParams = [idAlumno, clase.idPlan];
    } else {
      sqlBuscarCredito = `
        SELECT idCredito, creditosCisponibles, creditosUtilizados
        FROM credito
        WHERE idAlumno = ? AND estado = 'ACTIVO' AND creditosCisponibles > 0 AND fechaVencimiento >= CURDATE()
        ORDER BY fechaVencimiento ASC LIMIT 1 FOR UPDATE
      `;
      creditoParams = [idAlumno];
    }
    const [creditoRows] = await connection.query(sqlBuscarCredito, creditoParams);

    if (creditoRows.length === 0) {
      await connection.rollback();
      connection.release();
      const msg = clase.idPlan
        ? 'No tenés créditos disponibles para este tipo de plan. Verificá tu membresía activa.'
        : 'No poseés créditos disponibles activos para agendar clases.';
      return errorResponse(res, msg, 'SIN_CREDITOS', 400);
    }

    const creditoActivo = creditoRows[0];

    // Verificar duplicados de reserva
    const [yaReservado] = await connection.query(
      "SELECT idReserva FROM reserva WHERE idAlumno = ? AND idHorario = ? AND fechaReserva = ? AND estado = 'proxima'",
      [idAlumno, idHorario, fechaReserva]
    );

    if (yaReservado.length > 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Ya tenés una reserva activa para esta misma clase.', 'DUPLICATE_RESERVA', 400);
    }

    // 3. 📝 EJECUTAMOS LAS OPERACIONES EN TU BASE DE DATOS REAL
    const horaActual = new Date().toLocaleTimeString('es-AR', { hour12: false });
    
    // Insertamos la reserva (guardamos el idCredito para saber de dónde descontó por si cancela)
    await connection.query(
      "INSERT INTO reserva (fechaReserva, horaReserva, estado, idAlumno, idHorario, idCredito) VALUES (?, ?, 'proxima', ?, ?, ?)",
      [fechaReserva, horaActual, idAlumno, idHorario, creditoActivo.idCredito]
    );

    // 🚀 DESCUENTO REAL: Modificamos las columnas de tu grilla 'creditosCisponibles' y 'creditosUtilizados'
    await connection.query(
      `UPDATE credito 
       SET creditosCisponibles = creditosCisponibles - 1,
           creditosUtilizados = creditosUtilizados + 1
       WHERE idCredito = ?`,
      [creditoActivo.idCredito]
    );

    await connection.commit();
    connection.release();

    crearNotificacion(idUsuarioReal, 'reserva',
      'Reserva confirmada',
      `Tu reserva para "${clase.nombreClase}" el ${fechaReserva} fue confirmada. Se descontó 1 crédito.`
    );

    return successResponse(res, '¡Reserva confirmada con éxito!', {
      idHorario,
      fechaReserva
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

  const query = `
    SELECT
      r.idReserva,
      r.fechaReserva,
      r.horaReserva,
      CASE
        WHEN r.estado = 'cancelada' THEN 'cancelada'
        WHEN asi.estado = 'presente' THEN 'completada'
        WHEN asi.estado = 'ausente' THEN 'inasistencia'
        WHEN r.estado = 'proxima' AND r.fechaReserva < CURDATE() THEN 'completada'
        ELSE r.estado
      END AS estadoReserva,
      h.horaInicio,
      h.horaFin,
      h.dia,
      c.idClase,
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
    LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
    WHERE u.idUsuario = ?
    ORDER BY r.fechaReserva DESC, h.horaInicio DESC
  `;

  const [misReservas] = await db.query(query, [idUsuarioLogueado]);

  return successResponse(res, 'Reservas obtenidas correctamente', misReservas);
});

/**
 * GET /api/vv1/reservas/admin/usuario/:idUsuario
 * Admin: historial de reservas de un usuario específico
 */
exports.obtenerReservasDeUsuario = asyncHandler(async (req, res) => {
  const { idUsuario } = req.params;

  const query = `
    SELECT
      r.idReserva,
      r.fechaReserva,
      r.horaReserva,
      CASE
        WHEN r.estado = 'cancelada' THEN 'cancelada'
        WHEN asi.estado = 'presente' THEN 'completada'
        WHEN asi.estado = 'ausente' THEN 'inasistencia'
        WHEN r.estado = 'proxima' AND r.fechaReserva < CURDATE() THEN 'completada'
        ELSE r.estado
      END AS estadoReserva,
      c.nombreClase,
      h.horaInicio,
      h.horaFin,
      h.dia,
      per_prof.nombrecompleto AS nombreProfesor
    FROM reserva r
    INNER JOIN alumno a ON r.idAlumno = a.idAlumno
    INNER JOIN usuario u ON a.idPersona = u.idPersona
    INNER JOIN horarioclase h ON r.idHorario = h.idHorario
    INNER JOIN diaclase c ON h.idClase = c.idClase
    LEFT JOIN profesor prof ON c.idProfesor = prof.idProfesor
    LEFT JOIN persona per_prof ON prof.idPersona = per_prof.idPersona
    LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
    WHERE u.idUsuario = ?
    ORDER BY r.fechaReserva DESC, h.horaInicio DESC
  `;

  const [reservas] = await db.query(query, [idUsuario]);
  return successResponse(res, 'Reservas del usuario obtenidas correctamente', reservas);
});

/**
 * PATCH /api/vv1/reservas/:id/cancelar
 * Cancela una reserva reintegrando el cupo e impactando el crédito bajo la regla de las 2 horas
 */
exports.cancelarReserva = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const idUsuarioReal = req.user?.idUsuario;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Traer la reserva y el idCredito asociado desde donde se descontó originalmente
    const sqlReserva = `
      SELECT r.idReserva, r.fechaReserva, h.horaInicio, r.estado, c.idClase, r.idCredito
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

    // VALIDACIÓN DE ANTICIPACIÓN (2 horas de margen)
    const [fechaAño, fechaMes, fechaDia] = reserva.fechaReserva.toISOString().split('T')[0].split('-');
    const [horaH, horaM, horaS] = reserva.horaInicio.split(':');
    
    const fechaClaseTarget = new Date(fechaAño, fechaMes - 1, fechaDia, horaH, horaM, horaS);
    const ahora = new Date();
    
    const diferenciaHoras = (fechaClaseTarget - ahora) / (1000 * 60 * 60);
    let devuelveCredito = true;

    if (diferenciaHoras < 2) {
      devuelveCredito = false; 
    }

    // Actualizar estado de la reserva
    await connection.query("UPDATE reserva SET estado = 'cancelada' WHERE idReserva = ?", [id]);

    // 🚀 DEVOLUCIÓN REAL: Si canceló a tiempo, devolvemos el pase usando tus columnas reales
    if (devuelveCredito && reserva.idCredito) {
      await connection.query(
        `UPDATE credito 
         SET creditosCisponibles = creditosCisponibles + 1,
             creditosUtilizados = creditosUtilizados - 1
         WHERE idCredito = ?`,
        [reserva.idCredito]
      );
    }

    await connection.commit();
    connection.release();

    crearNotificacion(idUsuarioReal, 'reserva',
      'Reserva cancelada',
      devuelveCredito
        ? 'Tu reserva fue cancelada y el crédito fue devuelto a tu cuenta.'
        : 'Tu reserva fue cancelada fuera de término. El crédito no fue reintegrado (menos de 2hs de anticipación).'
    );

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

exports.obtenerMisCreditosYMovimientos = asyncHandler(async (req, res) => {
  const idUsuarioLogueado = req.user.idUsuario;

  if (!idUsuarioLogueado) {
    return errorResponse(res, 'No se pudo identificar al usuario.', 401);
  }

  // 1. Obtener los datos del abono activo actual de la tabla 'credito'
  const sqlAbono = `
    SELECT
      c.idCredito,
      c.totalCreditos,
      c.creditosCisponibles,
      c.creditosUtilizados,
      c.fechaVencimiento,
      pl.nombre AS nombrePlan
    FROM credito c
    INNER JOIN alumno a ON c.idAlumno = a.idAlumno
    INNER JOIN usuario u ON a.idPersona = u.idPersona
    INNER JOIN pago p ON c.idPago = p.idPago
    INNER JOIN plan pl ON p.idPlan = pl.idPlan
    WHERE u.idUsuario = ? AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
    ORDER BY c.fechaVencimiento DESC LIMIT 1
  `;
  const [abonoRows] = await db.query(sqlAbono, [idUsuarioLogueado]);
  
  // Si no tiene abono activo, estructuramos un objeto vacío por defecto
  const abonoActivo = abonoRows[0] || {
    totalCreditos: 0,
    creditosCisponibles: 0,
    creditosUtilizados: 0,
    fechaVencimiento: null,
    nombrePlan: 'Sin plan activo'
  };

  // 2. Obtener el historial integrado de movimientos mediante UNION (Reservas vs Renovaciones)
  const sqlMovimientos = `
    SELECT * FROM (
      SELECT
        r.fechaReserva AS fecha,
        CONCAT('Reserva ', c.nombreClase, ' ', h.horaInicio) AS descripcion,
        CASE
          WHEN r.estado = 'cancelada' AND r.idCredito IS NOT NULL THEN 'Cancelada (Devuelto)'
          WHEN r.estado = 'cancelada' THEN 'Cancelada (Fuera de término)'
          WHEN r.estado = 'proxima' AND r.fechaReserva >= CURDATE() THEN 'Próxima'
          WHEN asi.estado = 'ausente' THEN 'No asistió'
          ELSE 'Asistió'
        END AS estado,
        CASE
          WHEN r.estado = 'cancelada' AND r.idCredito IS NOT NULL THEN '+1'
          WHEN r.estado = 'cancelada' THEN '0'
          ELSE '-1'
        END AS creditos
      FROM reserva r
      INNER JOIN alumno a ON r.idAlumno = a.idAlumno
      INNER JOIN usuario u ON a.idPersona = u.idPersona
      INNER JOIN horarioclase h ON r.idHorario = h.idHorario
      INNER JOIN diaclase c ON h.idClase = c.idClase
      LEFT JOIN asistencia asi ON asi.idReserva = r.idReserva
      WHERE u.idUsuario = ?

      UNION ALL

      SELECT
        p.fechaPago AS fecha,
        CONCAT('Renovación membresía: ', pl.nombre) AS descripcion,
        'Histórico' AS estado,
        CONCAT('+', c.totalCreditos) AS creditos
      FROM credito c
      INNER JOIN alumno a ON c.idAlumno = a.idAlumno
      INNER JOIN usuario u ON a.idPersona = u.idPersona
      INNER JOIN pago p ON c.idPago = p.idPago
      INNER JOIN plan pl ON p.idPlan = pl.idPlan
      WHERE u.idUsuario = ?
    ) AS historial
    ORDER BY fecha DESC
  `;

  const [movimientos] = await db.query(sqlMovimientos, [idUsuarioLogueado, idUsuarioLogueado]);

  return successResponse(res, 'Métricas e historial cargados correctamente', {
    abono: abonoActivo,
    movimientos: movimientos
  });
});