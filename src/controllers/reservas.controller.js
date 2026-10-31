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
  // Los datos del pedido se validan ANTES de tocar la base (un valor raro no debe llegar a la consulta)
  if (!/^\d+$/.test(String(idHorario))) return errorResponse(res, 'El horario no es válido.', 'INVALID_SCHEDULE', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaReserva)) || Number.isNaN(new Date(fechaReserva + 'T12:00:00').getTime())) {
    return errorResponse(res, 'La fecha de la reserva no es válida.', 'INVALID_DATE', 400);
  }

  // Puede reservar quien tiene el permiso de crear reservas: el del alumno (alumno_reservas) o el de gestión (reservas).
  // Antes se miraba el módulo 'clases', que el perfil Alumno puede no tener: una persona con perfil y membresía correctos
  // recibía "No tenés permisos de alumno" sin motivo. Es el mismo permiso que ya exige la ruta (reservas.routes.js).
  const sqlValidarPermiso = `
    SELECT COUNT(*) as puedeReservar
    FROM perfilpermiso pp
    INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
    WHERE pp.idPerfil = ? AND LOWER(p.modulo) IN ('alumno_reservas', 'reservas') AND LOWER(p.accion) = 'alta'
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
      SELECT c.idClase, c.cupoMaximo, c.nombreClase, c.estado, c.tipoPlan,
        h.dia AS diaHorario, DATE_FORMAT(h.fechaEspecifica, '%Y-%m-%d') AS fechaEspecifica,
        TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(?, h.horaInicio)) AS minutosParaInicio,
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
    const [claseRows] = await connection.query(sqlBuscarClase, [fechaReserva, idHorario, fechaReserva, idHorario]);

    if (claseRows.length === 0) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'La clase o el horario seleccionado no existen.', 'NOT_FOUND', 404);
    }

    const clase = claseRows[0];

    // La fecha tiene que ser un día real, coincidir con el día de la clase y faltar 2 horas o más para que empiece
    // (estas reglas antes solo las aplicaba la pantalla: el servidor aceptaba cualquier fecha)
    const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaReserva)) && !Number.isNaN(new Date(fechaReserva + 'T12:00:00').getTime());
    const rechazar = async (mensaje, codigo) => { await connection.rollback(); connection.release(); return errorResponse(res, mensaje, codigo, 400); };
    if (!fechaValida) return rechazar('La fecha de la reserva no es válida.', 'INVALID_DATE');
    if (clase.fechaEspecifica ? clase.fechaEspecifica !== fechaReserva : DIAS[new Date(fechaReserva + 'T12:00:00').getDay()] !== String(clase.diaHorario).toUpperCase()) {
      return rechazar('Esa clase no se dicta en la fecha elegida.', 'DATE_MISMATCH');
    }
    if (clase.minutosParaInicio === null || clase.minutosParaInicio < 120) {
      return rechazar('Solo se puede reservar hasta 2 horas antes de que empiece la clase.', 'TOO_LATE');
    }

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

    // Buscar crédito activo del alumno: sirve el de cualquier plan que sea del mismo tipo que la clase (CrossFit, Planificación Atleta…).
    // Qué plan compró ("x12", "x3"…) no importa: manda el tipo, nunca el nombre del plan.
    let sqlBuscarCredito, creditoParams;
    if (clase.tipoPlan) {
      sqlBuscarCredito = `
        SELECT c.idCredito, c.creditosCisponibles, c.creditosUtilizados, pl.creditosPorSemana AS porSemana
        FROM credito c
        INNER JOIN pago p ON c.idPago = p.idPago
        INNER JOIN plan pl ON pl.idPlan = p.idPlan
        WHERE c.idAlumno = ? AND pl.tipo = ? AND c.estado = 'ACTIVO'
          AND c.creditosCisponibles > 0 AND c.fechaVencimiento >= CURDATE() AND c.fechaVencimiento >= ?
        ORDER BY c.fechaVencimiento ASC FOR UPDATE
      `;
      creditoParams = [idAlumno, clase.tipoPlan, fechaReserva];
    } else {
      sqlBuscarCredito = `
        SELECT c.idCredito, c.creditosCisponibles, c.creditosUtilizados, pl.creditosPorSemana AS porSemana
        FROM credito c
        INNER JOIN pago p ON c.idPago = p.idPago
        INNER JOIN plan pl ON pl.idPlan = p.idPlan
        WHERE c.idAlumno = ? AND c.estado = 'ACTIVO' AND c.creditosCisponibles > 0 AND c.fechaVencimiento >= CURDATE() AND c.fechaVencimiento >= ?
        ORDER BY c.fechaVencimiento ASC FOR UPDATE
      `;
      creditoParams = [idAlumno, fechaReserva];
    }
    const [creditoRows] = await connection.query(sqlBuscarCredito, creditoParams);

    if (creditoRows.length === 0) {
      await connection.rollback();
      connection.release();
      const [[tipoDeClase]] = clase.tipoPlan
        ? await connection.query('SELECT nombre FROM tipo_clase WHERE codigo = ?', [clase.tipoPlan])
        : [[null]];
      const msg = clase.tipoPlan
        ? `Esta clase es de ${tipoDeClase?.nombre || 'otro tipo'} y no tenés créditos vigentes de ese tipo. Verificá tu membresía activa.`
        : 'No poseés créditos disponibles activos para agendar clases.';
      return errorResponse(res, msg, 'SIN_CREDITOS', 400);
    }

    // Plan con "créditos por semana": solo se puede reservar hasta ese número en la semana de la clase (cada reserva cuenta, aunque después se cancele).
    // Si el alumno tiene más de un crédito vigente, se usa el primero que todavía tenga lugar esa semana.
    let creditoElegido = null;
    let semanaCompleta = null;
    for (const cr of creditoRows) {
      if (!cr.porSemana) { creditoElegido = cr; break; }
      const [[{ usadas }]] = await connection.query(
        'SELECT COUNT(*) AS usadas FROM reserva WHERE idCredito = ? AND YEARWEEK(fechaReserva, 1) = YEARWEEK(?, 1)',
        [cr.idCredito, fechaReserva]
      );
      if (Number(usadas) < Number(cr.porSemana)) { creditoElegido = cr; break; }
      semanaCompleta = cr;
    }

    if (!creditoElegido) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, `Ya usaste los ${semanaCompleta.porSemana} créditos de esa semana. Se renuevan el lunes.`, 'SEMANA_COMPLETA', 400);
    }

    const creditoActivo = creditoElegido;

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
    const [insertResult] = await connection.query(
      "INSERT INTO reserva (fechaReserva, horaReserva, estado, idAlumno, idHorario, idCredito) VALUES (?, ?, 'proxima', ?, ?, ?)",
      [fechaReserva, horaActual, idAlumno, idHorario, creditoActivo.idCredito]
    );
    const idReserva = insertResult.insertId;

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
      `Tu reserva para "${clase.nombreClase}" el ${fechaReserva} fue confirmada. Se descontó 1 crédito.`,
      '/alumno/reservas'
    );

    return successResponse(res, '¡Reserva confirmada con éxito!', {
      idReserva,
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
      r.idHorario,
      r.fechaReserva,
      r.horaReserva,
      CASE
        WHEN r.estado = 'cancelada' THEN 'cancelada'
        WHEN asi.estado = 'presente' THEN 'completada'
        WHEN asi.estado = 'ausente' THEN 'inasistencia'
        WHEN r.estado = 'proxima' AND (r.fechaReserva < CURDATE() OR (r.fechaReserva = CURDATE() AND h.horaFin <= CURTIME())) THEN 'completada'
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
 * Rutinas (con sus ejercicios) de varias clases, como { idClase: rutina }.
 * La descripción puede venir como JSON {desc, rutina} (texto enriquecido) o como texto plano (viejo).
 */
async function rutinasDeClases(idsClaseRepetidos) {
  const idsClase = [...new Set(idsClaseRepetidos)];
  const porClase = {};
  if (idsClase.length === 0) return porClase;
  // db.query usa sentencias preparadas (execute), que no expanden listas: un "?" por elemento
  const marcas = (lista) => lista.map(() => '?').join(', ');
  const [rutinas] = await db.query(
    `SELECT idRutina, idClase, descripcion, nivel, categoria FROM rutina WHERE idClase IN (${marcas(idsClase)})`,
    idsClase
  );
  const idsRutina = rutinas.map((r) => r.idRutina);
  const [ejercicios] = idsRutina.length
    ? await db.query(
        `SELECT idRutina, nombre, videoUrl FROM ejercicio WHERE idRutina IN (${marcas(idsRutina)}) ORDER BY orden ASC`,
        idsRutina
      )
    : [[]];
  for (const r of rutinas) {
    let descripcion = r.descripcion || '';
    let contenido = '';
    try {
      const p = JSON.parse(r.descripcion || '');
      if (p && typeof p.rutina !== 'undefined') {
        descripcion = p.desc || '';
        contenido = p.rutina || '';
      }
    } catch { /* texto plano */ }
    porClase[r.idClase] = {
      descripcion,
      contenido,
      nivel: r.nivel,
      categoria: r.categoria,
      ejercicios: ejercicios
        .filter((e) => e.idRutina === r.idRutina)
        .map(({ nombre, videoUrl }) => ({ nombre, videoUrl })),
    };
  }
  return porClase;
}

/**
 * GET /api/vv1/reservas/mis-rutinas
 * Próximas clases reservadas por el alumno de la sesión, cada una con la rutina que cargó
 * el profesor (o null si todavía no hay). Solo devuelve rutinas de clases que reservó.
 */
exports.obtenerMisRutinas = asyncHandler(async (req, res) => {
  const idUsuario = req.user?.idUsuario;
  if (!idUsuario) return errorResponse(res, 'No se pudo identificar al usuario.', 'NOT_AUTHENTICATED', 401);

  const [reservas] = await db.query(
    `SELECT r.idReserva,
            DATE_FORMAT(r.fechaReserva, '%Y-%m-%d') AS fecha,
            h.horaInicio, h.horaFin,
            c.idClase, c.nombreClase,
            per.nombrecompleto AS nombreProfesor
     FROM reserva r
     INNER JOIN alumno a ON r.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     INNER JOIN horarioclase h ON r.idHorario = h.idHorario
     INNER JOIN diaclase c ON h.idClase = c.idClase
     LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
     LEFT JOIN persona per ON p.idPersona = per.idPersona
     WHERE u.idUsuario = ?
       AND r.estado = 'proxima'
       AND (r.fechaReserva > CURDATE() OR (r.fechaReserva = CURDATE() AND h.horaFin > CURTIME()))
     ORDER BY r.fechaReserva ASC, h.horaInicio ASC
     LIMIT 30`,
    [idUsuario]
  );

  const rutinasPorClase = await rutinasDeClases(reservas.map((r) => r.idClase));
  const resultado = reservas.map(({ idClase, ...r }) => ({ ...r, rutina: rutinasPorClase[idClase] || null }));
  return successResponse(res, 'Rutinas de tus clases reservadas', resultado);
});

/**
 * GET /api/vv1/reservas/:id/rutina
 * Rutina de la clase de UNA reserva. Solo si la reserva es de quien inició sesión (si es de otro, 403).
 */
exports.obtenerRutinaDeMiReserva = asyncHandler(async (req, res) => {
  const idUsuario = req.user?.idUsuario;
  const idReserva = Number(req.params.id);
  if (!Number.isInteger(idReserva) || idReserva <= 0) return errorResponse(res, 'Reserva inválida.', 'INVALID_ID', 400);

  const [rows] = await db.query(
    `SELECT h.idClase, u.idUsuario AS idDueno
     FROM reserva r
     INNER JOIN alumno a ON r.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     INNER JOIN horarioclase h ON r.idHorario = h.idHorario
     WHERE r.idReserva = ?`,
    [idReserva]
  );
  if (rows.length === 0) return errorResponse(res, 'Reserva no encontrada.', 'NOT_FOUND', 404);
  if (Number(rows[0].idDueno) !== Number(idUsuario)) {
    return errorResponse(res, 'No tenés permiso para ver esta reserva.', 'FORBIDDEN', 403);
  }

  const porClase = await rutinasDeClases([rows[0].idClase]);
  return successResponse(res, 'Rutina de la clase', porClase[rows[0].idClase] || null);
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
        WHEN r.estado = 'proxima' AND (r.fechaReserva < CURDATE() OR (r.fechaReserva = CURDATE() AND h.horaFin <= CURTIME())) THEN 'completada'
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
      SELECT r.idReserva, r.fechaReserva, h.horaInicio, h.horaFin, r.estado, c.idClase, r.idCredito
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
    
    // Una clase que ya terminó no se cancela: pasó a ser parte del historial
    const [finH, finM, finS] = String(reserva.horaFin).split(':');
    if (new Date(fechaAño, fechaMes - 1, fechaDia, finH, finM, finS || 0) <= ahora) {
      await connection.rollback();
      connection.release();
      return errorResponse(res, 'Esa clase ya terminó, no se puede cancelar.', 'INVALID_STATE', 400);
    }

    const diferenciaHoras = (fechaClaseTarget - ahora) / (1000 * 60 * 60);
    let devuelveCredito = true;

    if (diferenciaHoras < 2) {
      devuelveCredito = false; 
    }

    // Plan con créditos por semana: el crédito ya cuenta para esa semana y cancelar no lo devuelve (aunque cancele con tiempo)
    let esSemanal = false;
    if (reserva.idCredito) {
      const [[semanal]] = await connection.query(
        `SELECT pl.creditosPorSemana AS porSemana
           FROM credito c
           INNER JOIN pago p ON p.idPago = c.idPago
           INNER JOIN plan pl ON pl.idPlan = p.idPlan
          WHERE c.idCredito = ?`,
        [reserva.idCredito]
      );
      if (semanal && semanal.porSemana) { esSemanal = true; devuelveCredito = false; }
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
      esSemanal
        ? 'Tu reserva fue cancelada. En tu plan los créditos no se devuelven al cancelar: cuenta para los de la semana.'
        : devuelveCredito
        ? 'Tu reserva fue cancelada y el crédito fue devuelto a tu cuenta.'
        : 'Tu reserva fue cancelada fuera de término. El crédito no fue reintegrado (menos de 2hs de anticipación).',
      '/alumno/reservas'
    );

    return successResponse(res, 'Reserva cancelada correctamente.', {
      idReserva: Number(id),
      devuelveCredito,
      esSemanal,
      mensaje: esSemanal
        ? "Reserva cancelada. En tu plan el crédito no se devuelve."
        : devuelveCredito
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
  // Se consulta por polling cada 8s desde CreditosPage; sin esto el navegador
  // puede servir una respuesta vieja cacheada (304 en Network) en vez de traer
  // los créditos actualizados del servidor.
  res.set('Cache-Control', 'no-store')

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
      pl.nombre AS nombrePlan,
      pl.creditosPorSemana AS porSemana
    FROM credito c
    INNER JOIN alumno a ON c.idAlumno = a.idAlumno
    INNER JOIN usuario u ON a.idPersona = u.idPersona
    INNER JOIN pago p ON c.idPago = p.idPago
    INNER JOIN plan pl ON p.idPlan = pl.idPlan
    WHERE u.idUsuario = ? AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
    ORDER BY c.fechaVencimiento ASC
  `;
  const [abonoRows] = await db.query(sqlAbono, [idUsuarioLogueado]);

  // Cada compra tiene su propio crédito con su propio vencimiento: si el alumno
  // contrató más de un plan, los créditos se suman y cada bloque deja de contar
  // cuando vence el suyo (la consulta ya filtra los vencidos).
  const abonoSumado = abonoRows.length === 0 ? null : {
    totalCreditos: abonoRows.reduce((a, r) => a + Number(r.totalCreditos), 0),
    creditosCisponibles: abonoRows.reduce((a, r) => a + Number(r.creditosCisponibles), 0),
    creditosUtilizados: abonoRows.reduce((a, r) => a + Number(r.creditosUtilizados), 0),
    fechaVencimiento: abonoRows[0].fechaVencimiento,
    nombrePlan: [...new Set(abonoRows.map(r => r.nombrePlan))].join(' + '),
  };

  // Si no tiene abono activo, estructuramos un objeto vacío por defecto
  const abonoActivo = abonoSumado || {
    totalCreditos: 0,
    creditosCisponibles: 0,
    creditosUtilizados: 0,
    fechaVencimiento: null,
    nombrePlan: 'Sin plan activo'
  };

  // Si algún plan tiene "créditos por semana": cuántos se pueden usar por semana y cuántos lleva usados esta semana
  const semanales = abonoRows.filter((r) => r.porSemana);
  let semana = null;
  if (semanales.length > 0) {
    const ids = semanales.map((r) => r.idCredito);
    const [[{ usadas }]] = await db.query(
      `SELECT COUNT(*) AS usadas FROM reserva WHERE idCredito IN (${ids.map(() => '?').join(',')}) AND YEARWEEK(fechaReserva, 1) = YEARWEEK(CURDATE(), 1)`,
      ids
    );
    semana = { porSemana: semanales.reduce((a, r) => a + Number(r.porSemana), 0), usadas: Number(usadas) };
  }

  // 2. Obtener el historial integrado de movimientos mediante UNION (Reservas vs Renovaciones)
  const sqlMovimientos = `
    SELECT * FROM (
      SELECT
        r.fechaReserva AS fecha,
        CONCAT('Reserva ', c.nombreClase, ' ', h.horaInicio) AS descripcion,
        CASE
          WHEN r.estado = 'cancelada' AND plr.creditosPorSemana IS NOT NULL THEN 'Cancelada (sin devolución)'
          WHEN r.estado = 'cancelada' AND r.idCredito IS NOT NULL THEN 'Cancelada (Devuelto)'
          WHEN r.estado = 'cancelada' THEN 'Cancelada (Fuera de término)'
          WHEN r.estado = 'proxima' AND r.fechaReserva >= CURDATE() THEN 'Próxima'
          WHEN asi.estado = 'ausente' THEN 'No asistió'
          ELSE 'Asistió'
        END AS estado,
        CASE
          WHEN r.estado = 'cancelada' AND plr.creditosPorSemana IS NOT NULL THEN '-1'
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
      LEFT JOIN credito crd ON crd.idCredito = r.idCredito
      LEFT JOIN pago pg ON pg.idPago = crd.idPago
      LEFT JOIN plan plr ON plr.idPlan = pg.idPlan
      WHERE u.idUsuario = ?

      UNION ALL

      SELECT
        p.fechaPago AS fecha,
        CONCAT('Renovación membresía: ', pl.nombre) AS descripcion,
        -- Un abono anulado por el admin queda en el historial, pero no suma créditos
        CASE WHEN c.estado = 'CANCELADO' THEN 'Anulado' ELSE 'Histórico' END AS estado,
        CASE WHEN c.estado = 'CANCELADO' THEN '0' ELSE CONCAT('+', c.totalCreditos) END AS creditos
      FROM credito c
      INNER JOIN alumno a ON c.idAlumno = a.idAlumno
      INNER JOIN usuario u ON a.idPersona = u.idPersona
      INNER JOIN pago p ON c.idPago = p.idPago
      INNER JOIN plan pl ON p.idPlan = pl.idPlan
      WHERE u.idUsuario = ?

      UNION ALL

      SELECT
        d.fecha AS fecha,
        'Créditos sin usar de la semana' AS descripcion,
        'Vencido' AS estado,
        CONCAT('-', d.cantidad) AS creditos
      FROM credito_descuento d
      INNER JOIN credito c ON c.idCredito = d.idCredito
      INNER JOIN alumno a ON c.idAlumno = a.idAlumno
      INNER JOIN usuario u ON a.idPersona = u.idPersona
      WHERE u.idUsuario = ?
    ) AS historial
    ORDER BY fecha DESC
  `;

  const [movimientos] = await db.query(sqlMovimientos, [idUsuarioLogueado, idUsuarioLogueado, idUsuarioLogueado]);

  return successResponse(res, 'Métricas e historial cargados correctamente', {
    abono: { ...abonoActivo, semana },
    movimientos: movimientos
  });
});