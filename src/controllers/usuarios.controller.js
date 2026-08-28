const db = require('../config/db');
const { crearNotificacion, crearNotificacionAdmins, getIdUsuarioPorCredito } = require('../functions/notificacion.service');
const obtenerUsuarioPorId = require('../data/Usuarios/ObtenerUsuarioPorId');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
const insertarPersona = require('../data/Persona/InsertarPersona');
const actualizarEstadoUsuario = require('../data/Usuarios/ActualizarEstadoUsuario');
const eliminarUsuario = require('../data/Usuarios/EliminarUsuario');
const eliminarPersona = require('../data/Persona/EliminarPersona');
const cloudinary = require('../config/cloudinary');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { hashPassword } = require('../functions/encryption');

/**
 * 🟢 HELPER INTERNO: Sincroniza de forma automática la tabla "profesor"
 * basándose en los permisos reales de su perfil asignado en la tabla "perfilpermiso"
 */
const sincronizarFichaProfesor = async (connection, idPersona, idPerfil) => {
  if (!idPerfil) return;

  // Busca si el perfil tiene asignado cualquier permiso del módulo 'profesor'
  const queryPermiso = `
    SELECT COUNT(*) AS tienePermiso 
    FROM perfilpermiso pp
    INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
    WHERE pp.idPerfil = ? AND p.modulo = 'profesor'
  `;
  
  const [permisoRows] = await connection.query(queryPermiso, [parseInt(idPerfil)]);
  const tieneAccesoACoach = permisoRows[0].tienePermiso > 0;

  if (tieneAccesoACoach) {
    // Inserta la ficha de profesor vinculando la idPersona de forma automática si no existe
    const sqlInsertProfesor = `
      INSERT IGNORE INTO profesor (especialidad, idPersona) 
      VALUES (?, ?)
    `;
    await connection.query(sqlInsertProfesor, ['Crossfit / General', idPersona]);
  }
};

/**
 * GET /api/usuarios
 * Obtiene lista de todos los usuarios con su perfil real calculado
 */
exports.getAll = asyncHandler(async (req, res) => {
  const sql = `
    SELECT 
      u.idUsuario,
      u.username,
      u.idPerfil,
      u.estado, -- Mantiene el estado del usuario base (Activo/Suspendido)
      p.nombrecompleto,
      p.dni,
      p.correo,
      p.telefono,
      perf.nombrePerfil AS nombrePerfil,
      ua.url AS avatarUrl,
      -- 🟢 CRÉDITOS REALES: Suma de turnos disponibles activos
      IFNULL(SUM(CASE WHEN c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE() THEN c.creditosCisponibles ELSE 0 END), 0) AS creditos,
      -- 🟢 MEMBRESÍA DINÁMICA: Si tiene créditos disponibles y no vencieron, está ACTIVA. Sino, VENCIDA.
      CASE
        WHEN SUM(CASE WHEN c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE() AND c.creditosCisponibles > 0 THEN 1 ELSE 0 END) > 0 THEN 'activa'
        ELSE 'vencida'
      END AS membresia
    FROM usuario u
    INNER JOIN persona p ON u.idPersona = p.idPersona
    LEFT JOIN perfil perf ON u.idPerfil = perf.idPerfil
    LEFT JOIN alumno a ON p.idPersona = a.idPersona
    LEFT JOIN credito c ON a.idAlumno = c.idAlumno
    LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
    GROUP BY u.idUsuario, p.idPersona, perf.idPerfil, a.idAlumno, ua.url
  `;

  const [rows] = await db.query(sql);
  return successResponse(res, 'Usuarios obtenidos correctamente', rows);
});

/**
 * GET /api/usuarios/:id
 * Obtiene un usuario específico
 */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;


  const userSql = `
    SELECT 
      u.idUsuario,
      u.username,
      u.estado,
      u.idPersona,
      p.nombrecompleto AS nombre,        -- 🟢 Mapea directo a user.nombre
      p.dni AS dni,                     -- 🟢 Mapea directo a user.dni
      p.correo AS email,                 -- 🟢 Mapea directo a user.email
      p.telefono AS telefono,           -- 🟢 Mapea directo a user.telefono
      p.fecha_registro AS fechaRegistro, -- 🟢 Usa tu columna real con guión bajo
      perf.nombrePerfil AS perfil,       -- 🟢 Mapea directo a user.perfil
      ua.url AS avatarUrl
    FROM usuario u
    INNER JOIN persona p ON u.idPersona = p.idpersona -- 💡 idpersona va todo en minúsculas en tu DB
    LEFT JOIN perfil perf ON u.idPerfil = perf.idPerfil
    LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
    WHERE u.idUsuario = ?
  `;

  const [usuarios] = await db.query(userSql, [id]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuarioBase = usuarios[0];

 
  const metricsSql = `
    SELECT 
      IFNULL(SUM(CASE WHEN c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE() THEN c.creditosCisponibles ELSE 0 END), 0) AS creditosCalculados,
      CASE 
        WHEN SUM(CASE WHEN c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE() AND c.creditosCisponibles > 0 THEN 1 ELSE 0 END) > 0 THEN 'activa'
        ELSE 'vencida'
      END AS membresiaCalculada
    FROM alumno a
    LEFT JOIN credito c ON a.idAlumno = c.idAlumno
    WHERE a.idPersona = ?
  `;

  const [metricsRows] = await db.query(metricsSql, [usuarioBase.idPersona]);
  const metricas = metricsRows[0] || { creditosCalculados: 0, membresiaCalculada: 'vencida' };

  
  const usuarioFinal = {
    ...usuarioBase,
    creditos: metricas.creditosCalculados,
    membresia: metricas.membresiaCalculada  
  };
  return successResponse(res, 'Usuario obtenido correctamente', usuarioFinal);
});

/**
 * POST /api/usuarios
 * Crea un nuevo usuario y automatiza la ficha de profesor si corresponde
 */
exports.create = asyncHandler(async (req, res) => {
  const { nombrecompleto, dni, correo, telefono, username, password, idPerfil } = req.body;

  // Usamos una transacción para garantizar consistencia total multi-tabla
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Insertamos en la tabla persona
    const [personaResult] = await connection.query(insertarPersona, [
      nombrecompleto,
      dni,
      correo,
      telefono || null,
    ]);
    const personaId = personaResult.insertId;

    // 2. Encriptamos clave
    const hashedPassword = await hashPassword(password);

    // 3. Insertamos en la tabla usuario
    const [usuarioResult] = await connection.query(insertarUsuario, [
      personaId,
      username,
      hashedPassword,
      idPerfil,
      'activo',
    ]);

    // 4. 🟢 AUTOMATISMO: Sincroniza la tabla profesor con la tabla intermedia perfilpermiso
    await sincronizarFichaProfesor(connection, personaId, idPerfil);

    await connection.commit();

    const [nuevoUsuario] = await db.query(obtenerUsuarioPorId, [usuarioResult.insertId]);

    crearNotificacionAdmins('sistema',
      'Nuevo usuario registrado',
      `Se registró un nuevo usuario: ${nombrecompleto} (${correo}).`
    );
    crearNotificacion(usuarioResult.insertId, 'sistema',
      '¡Bienvenido a Bravos Box!',
      `Hola ${nombrecompleto}, tu cuenta fue creada exitosamente. ¡Empezá a entrenar!`
    );

    return successResponse(res, 'Usuario creado exitosamente con sus automatizaciones', nuevoUsuario[0], 201);

  } catch (error) {
    await connection.rollback();
    console.error("Error al registrar usuario de forma integral:", error);
    return errorResponse(res, 'Error en el servidor al registrar el perfil y permisos', 500);
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/usuarios/:id
 * Actualiza datos de un usuario de forma segura y recalcula su rol de profesor en tiempo real
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombre, nombrecompleto, email, correo, dni, telefono, username, idPerfil, estado } = req.body;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const [usuarios] = await connection.query('SELECT * FROM usuario WHERE idUsuario = ?', [id]);
    if (usuarios.length === 0) {
      connection.release();
      return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
    }
    const usuarioActual = usuarios[0];

    const [personas] = await connection.query('SELECT * FROM persona WHERE idPersona = ?', [usuarioActual.idPersona]);
    const personaActual = personas[0] || {};

    const finalNombre = nombrecompleto || nombre || personaActual.nombrecompleto;
    const finalCorreo = correo || email || personaActual.correo;
    const finalDni = dni || personaActual.dni;
    const finalTelefono = telefono || personaActual.telefono;
    const finalUsername = username || email || correo || usuarioActual.username;
    const finalEstado = estado || usuarioActual.estado;
    
    const finalIdPerfil = idPerfil !== undefined && idPerfil !== null && idPerfil !== "" 
      ? parseInt(idPerfil) 
      : usuarioActual.idPerfil;

    // 1. Modificamos el usuario base
    const sqlUsuario = 'UPDATE usuario SET username = ?, idPerfil = ?, estado = ? WHERE idUsuario = ?';
    await connection.query(sqlUsuario, [finalUsername, finalIdPerfil, finalEstado, id]);

    // 2. Modificamos la persona vinculada
    const sqlPersona = 'UPDATE persona SET nombrecompleto = ?, dni = ?, correo = ?, telefono = ? WHERE idPersona = ?';
    await connection.query(sqlPersona, [finalNombre, finalDni, finalCorreo, finalTelefono, usuarioActual.idPersona]);

    // 3. 🟢 AUTOMATISMO: Si se editó el perfil, recalculamos si se le activa la credencial de profesor
    await sincronizarFichaProfesor(connection, usuarioActual.idPersona, finalIdPerfil);

    await connection.commit();
    return successResponse(res, 'Usuario y permisos actualizados con éxito');

  } catch (error) {
    await connection.rollback();
    console.error("Error crítico al actualizar usuario y sincronizar profesor:", error);
    return errorResponse(res, 'Error interno al actualizar la ficha del usuario', 500);
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/usuarios/:id/estado
 * Cambia el estado de un usuario
 */
exports.cambiarEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  await db.query(actualizarEstadoUsuario, [estado, id]);
  const [usuarioActualizado] = await db.query(obtenerUsuarioPorId, [id]);

  crearNotificacion(Number(id), 'sistema',
    estado === 'activo' ? 'Cuenta activada' : 'Cuenta desactivada',
    estado === 'activo'
      ? 'Tu cuenta fue activada. Ya podés acceder al sistema normalmente.'
      : 'Tu cuenta fue desactivada por un administrador. Contactá con el box para más información.'
  );

  return successResponse(res, `Usuario marcado como ${estado}`, usuarioActualizado[0]);
});

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario y todos sus registros asociados en cascada
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarioExistente[0];
  const idPersona = usuario.idPersona || usuario.idpersona;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // 1. Asistencias de las reservas del alumno
    await connection.query(`
      DELETE asi FROM asistencia asi
      INNER JOIN reserva r ON asi.idReserva = r.idReserva
      INNER JOIN alumno a ON r.idAlumno = a.idAlumno
      WHERE a.idPersona = ?`, [idPersona]);

    // 2. Reservas del alumno
    await connection.query(`
      DELETE r FROM reserva r
      INNER JOIN alumno a ON r.idAlumno = a.idAlumno
      WHERE a.idPersona = ?`, [idPersona]);

    // 3. Créditos del alumno
    await connection.query(`
      DELETE c FROM credito c
      INNER JOIN alumno a ON c.idAlumno = a.idAlumno
      WHERE a.idPersona = ?`, [idPersona]);

    // 4. Registro de alumno
    await connection.query('DELETE FROM alumno WHERE idPersona = ?', [idPersona]);

    // 5. Registro de profesor (si aplica)
    await connection.query('DELETE FROM profesor WHERE idPersona = ?', [idPersona]);

    // 6. Usuario (notificaciones se borran por CASCADE)
    await connection.query('DELETE FROM usuario WHERE idUsuario = ?', [id]);

    // 7. Persona
    await connection.query('DELETE FROM persona WHERE idpersona = ?', [idPersona]);

    await connection.commit();
    connection.release();

    return successResponse(res, 'Usuario eliminado exitosamente', {
      idUsuario: id,
      nombrecompleto: usuario.nombrecompleto,
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Error al eliminar usuario en cascada:', err.message);
    return errorResponse(res, 'No se pudo eliminar el usuario. Verificá que no tenga registros dependientes.', 'DELETE_FAILED', 500);
  }
});

/**
 * PUT /api/usuarios/:id/avatar
 * Actualiza la foto de perfil del usuario en Cloudinary
 */
exports.updateAvatar = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { avatarData } = req.body;

  if (!avatarData) {
    return errorResponse(res, 'La imagen del avatar es obligatoria', 'AVATAR_REQUIRED', 400);
  }

  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const resultado = await cloudinary.uploader.upload(avatarData, {
    folder: 'bravos_avatars',
    width: 400,
    height: 400,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto',
    fetch_format: 'auto',
    resource_type: 'image',
  });

  const actualizarAvatarUsuario = require('../data/Avatar/ActualizarAvatarUsuario');
  await db.query(actualizarAvatarUsuario, [id, resultado.secure_url]);

  const [usuarioActualizado] = await db.query(obtenerUsuarioPorId, [id]);

  return successResponse(res, 'Avatar actualizado exitosamente', {
    avatarUrl: resultado.secure_url,
    usuario: usuarioActualizado[0],
  });
});

exports.getAbonosByUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [alumnos] = await db.query(
    `SELECT a.idAlumno FROM alumno a INNER JOIN usuario u ON a.idPersona = u.idPersona WHERE u.idUsuario = ?`,
    [id]
  );

  if (alumnos.length === 0) {
    return successResponse(res, 'El usuario no tiene alumno asociado', []);
  }

  const idAlumno = alumnos[0].idAlumno;

  // 🔍 Hacemos el JOIN para traer de la base de datos el nombre de la persona que operó
  const [abonos] = await db.query(
    `SELECT 
      c.idCredito AS id,
      p.fechaPago AS creado,
      c.fechaInicio AS inicio,
      c.fechaVencimiento AS vencimiento,
      pl.idPlan,
      pl.nombre AS abono,
      c.totalCreditos AS turnos,
      0 AS ajuste,
      c.creditosUtilizados AS usados,
      c.creditosCisponibles AS disponibles,
      c.estado,
      pPers.nombrecompleto AS operadorReal
     FROM credito c
     INNER JOIN pago p ON c.idPago = p.idPago
     INNER JOIN plan pl ON p.idPlan = pl.idPlan
     LEFT JOIN usuario pUsu ON p.idUsuarioOperador = pUsu.idUsuario
     LEFT JOIN persona pPers ON pUsu.idPersona = pPers.idPersona
     WHERE c.idAlumno = ?
     ORDER BY c.fechaInicio DESC`,
    [idAlumno]
  );

  return successResponse(res, 'Abonos obtenidos correctamente', abonos);
});

exports.getAllAbonos = asyncHandler(async (req, res) => {
  const [abonos] = await db.query(
    `SELECT
      c.idCredito AS id,
      u.idUsuario,
      per.nombrecompleto AS nombreAlumno,
      p.fechaPago AS creado,
      c.fechaInicio AS inicio,
      c.fechaVencimiento AS vencimiento,
      pl.idPlan,
      pl.nombre AS abono,
      c.totalCreditos AS turnos,
      0 AS ajuste,
      c.creditosUtilizados AS usados,
      c.creditosCisponibles AS disponibles,
      c.estado,
      pPers.nombrecompleto AS operadorReal
     FROM credito c
     INNER JOIN pago p ON c.idPago = p.idPago
     INNER JOIN plan pl ON p.idPlan = pl.idPlan
     INNER JOIN alumno a ON c.idAlumno = a.idAlumno
     INNER JOIN persona per ON a.idPersona = per.idPersona
     INNER JOIN usuario u ON per.idPersona = u.idPersona
     LEFT JOIN usuario pUsu ON p.idUsuarioOperador = pUsu.idUsuario
     LEFT JOIN persona pPers ON pUsu.idPersona = pPers.idPersona
     ORDER BY c.idCredito DESC`
  );
  return successResponse(res, 'Abonos obtenidos correctamente', abonos);
});

exports.createAbonoUsuario = asyncHandler(async (req, res) => {
  const { id } = req.params; // idUsuario del alumno

  const {
    tipoAbono,
    fechaInicio,
    fechaVencimiento,
    metodoPago,
    importe,
    idUsuarioOperador 
  } = req.body;

  // 1. Buscamos si el usuario ya tiene una ficha en la tabla alumno
  const [alumnos] = await db.query(
    `SELECT a.idAlumno
     FROM alumno a
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     WHERE u.idUsuario = ?`,
    [id]
  );

  let idAlumno;

  // Si el usuario no es alumno, lo creamos con la fecha de hoy
  if (alumnos.length === 0) {
    const [userRows] = await db.query(
      `SELECT idPersona FROM usuario WHERE idUsuario = ?`,
      [id]
    );

    if (userRows.length === 0) {
      return errorResponse(res, 'Usuario base no encontrado', 'USER_NOT_FOUND', 404);
    }

    const idPersona = userRows[0].idPersona;

    const [nuevoAlumnoResult] = await db.query(
      `INSERT INTO alumno (fechaAlta, estado, idPersona) 
       VALUES (CURDATE(), 'activo', ?)`,
      [idPersona]
    );

    idAlumno = nuevoAlumnoResult.insertId;
  } else {
    idAlumno = alumnos[0].idAlumno;
  }

  // 2. Buscamos el plan
  const [planes] = await db.query(
    `SELECT idPlan, nombre, precio, cantidadCreditos
     FROM plan
     WHERE UPPER(nombre) = UPPER(?)`,
    [tipoAbono]
  );

  if (planes.length === 0) {
    return errorResponse(res, 'Plan no encontrado', 'PLAN_NOT_FOUND', 404);
  }

  const plan = planes[0];
  const montoFinal = importe || plan.precio;

  const hoyLocal = new Date();
  const offset = hoyLocal.getTimezoneOffset() * 60000;
  const fechaPagoReal = new Date(hoyLocal.getTime() - offset).toISOString().split('T')[0];
  
  const inicioReal = fechaInicio ? fechaInicio : fechaPagoReal;
  
  let vencimientoReal;
  if (fechaVencimiento) {
    vencimientoReal = fechaVencimiento;
  } else {
    const auxFecha = new Date(inicioReal + 'T12:00:00');
    auxFecha.setDate(auxFecha.getDate() + 30);
    vencimientoReal = auxFecha.toISOString().split('T')[0];
  }

  // 🔍 BUSQUEDA DINÁMICA DEL OPERADOR REAL:
  // Obtenemos el nombre completo desde la tabla persona cruzando con el idUsuario que está operando
  const [operadorRows] = await db.query(
    `SELECT p.nombrecompleto 
     FROM usuario u
     INNER JOIN persona p ON u.idPersona = p.idPersona
     WHERE u.idUsuario = ?`,
    [idUsuarioOperador || 1] // Si no viene, toma el ID 1 por defecto
  );
  const nombreOperadorReal = operadorRows.length > 0 ? operadorRows[0].nombrecompleto : "Sistema";

  // 3. Insertamos el Registro de Pago guardando el nombre del operador real
  const [pagoResult] = await db.query(
    `INSERT INTO pago
     (fechaPago, importe, formaPago, estadoPago, fechaVencimiento, idAlumno, idPlan, idUsuarioOperador)
     VALUES (?, ?, ?, 'confirmado', ?, ?, ?, ?)`,
    [
      fechaPagoReal,
      montoFinal,
      metodoPago || 'Efectivo',
      vencimientoReal,
      idAlumno,
      plan.idPlan,
      idUsuarioOperador || null 
    ]
  );

  // 4. Insertamos los Créditos del Abono
  await db.query(
    `INSERT INTO credito
     (totalCreditos, creditosCisponibles, creditosUtilizados, fechaInicio, fechaVencimiento, estado, idAlumno, idPago)
     VALUES (?, ?, 0, ?, ?, 'ACTIVO', ?, ?)`,
    [
      plan.cantidadCreditos,
      plan.cantidadCreditos,
      inicioReal,
      vencimientoReal,
      idAlumno,
      pagoResult.insertId,
    ]
  );

  crearNotificacion(Number(id), 'credito',
    'Membresía activada',
    `Se cargó el plan "${tipoAbono}" con ${plan.cantidadCreditos} créditos. Vence el ${vencimientoReal}.`
  );

  return successResponse(res, 'Abono cargado y Alumno inicializado correctamente', null, 201);
});

exports.updateAbonoUsuario = asyncHandler(async (req, res) => {
  // 🚀 Capturamos el ID del abono desde cualquier variable posible de la ruta de Express
  const idCreditoReal = req.params.idCredito || req.params.id || req.params.idAbono;

  const {
    fechaInicio,
    fechaVencimiento,
    turnos,
    ajuste,
    estado,
  } = req.body;

  // Forzamos que el estado vaya en Mayúsculas limpias ('ACTIVO', 'CANCELADO') como tus inserts nativos
  const estadoFormateado = String(estado || 'ACTIVO').toUpperCase().trim();

  const totalCreditos = Number(turnos) + Number(ajuste || 0);

  // 1. Buscamos el estado actual del abono antes de sobreescribir
  const [creditoExistente] = await db.query(
    `SELECT idCredito, creditosUtilizados, totalCreditos, estado
     FROM credito
     WHERE idCredito = ?`,
    [idCreditoReal]
  );

  if (creditoExistente.length === 0) {
    console.error(`❌ ERROR: No se encontró el abono con ID: ${idCreditoReal}`);
    return errorResponse(res, 'Abono no encontrado en el sistema', 'ABONO_NOT_FOUND', 404);
  }

  const usados = creditoExistente[0].creditosUtilizados || 0;
  
  // 🚀 RECALCULO DE DISPONIBLES: 
  // Si pasa de CANCELADO a ACTIVO, recupera sus turnos totales menos los que ya gastó el alumno
  let disponibles = totalCreditos - usados;
  
  // Si explícitamente se lo deja en CANCELADO, los disponibles mueren en 0
  if (estadoFormateado === 'CANCELADO') {
    disponibles = 0;
  }

  // 2. Ejecutamos el UPDATE con los datos limpios y homologados
  await db.query(
    `UPDATE credito
     SET fechaInicio = ?,
         fechaVencimiento = ?,
         totalCreditos = ?,
         creditosCisponibles = ?, 
         estado = ?
     WHERE idCredito = ?`,
    [
      fechaInicio,
      fechaVencimiento,
      totalCreditos,
      disponibles,
      estadoFormateado, // 'ACTIVO' o 'CANCELADO'
      idCreditoReal,
    ]
  );

  const idUsuarioAlumno = await getIdUsuarioPorCredito(idCreditoReal);
  if (idUsuarioAlumno) {
    crearNotificacion(idUsuarioAlumno, 'credito',
      'Membresía actualizada',
      estadoFormateado === 'CANCELADO'
        ? 'Tu membresía fue marcada como cancelada. Contactá con el box para más información.'
        : `Tu membresía fue actualizada: ${totalCreditos} créditos en total, vence el ${fechaVencimiento}.`
    );
  }

  return successResponse(res, 'Abono modificado correctamente en la base de datos');
});

exports.cancelarAbonoUsuario = asyncHandler(async (req, res) => {
  const { idCredito } = req.params;

  const [creditoExistente] = await db.query(
    `SELECT idCredito FROM credito WHERE idCredito = ?`,
    [idCredito]
  );

  if (creditoExistente.length === 0) {
    return errorResponse(res, 'Abono no encontrado', 'ABONO_NOT_FOUND', 404);
  }

  // 🟢 CORREGIDO: Usando 'creditosCisponibles' para evitar el error ER_BAD_FIELD_ERROR
  await db.query(
    `UPDATE credito
     SET estado = 'CANCELADO',
         creditosCisponibles = 0
     WHERE idCredito = ?`,
    [idCredito]
  );

  const idUsuarioAlumno = await getIdUsuarioPorCredito(idCredito);
  if (idUsuarioAlumno) {
    crearNotificacion(idUsuarioAlumno, 'credito',
      'Membresía cancelada',
      'Tu membresía fue cancelada por un administrador. Tus créditos disponibles fueron puestos en cero. Contactá con el box.'
    );
  }

  return successResponse(res, 'Abono cancelado correctamente');
});

// Exportación centralizada limpia
module.exports = exports;