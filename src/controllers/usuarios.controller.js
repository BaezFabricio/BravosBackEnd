const db = require('../config/db');
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
      u.estado,
      p.nombrecompleto,
      p.dni,
      p.correo,
      p.telefono,
      perf.nombrePerfil AS nombrePerfil
    FROM usuario u
    INNER JOIN persona p ON u.idPersona = p.idPersona
    LEFT JOIN perfil perf ON u.idPerfil = perf.idPerfil
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
  const [usuarios] = await db.query(obtenerUsuarioPorId, [id]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  return successResponse(res, 'Usuario obtenido correctamente', usuarios[0]);
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

  return successResponse(res, `Usuario marcado como ${estado}`, usuarioActualizado[0]);
});

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario y su persona vinculada
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarioExistente[0];

  await db.query(eliminarUsuario, [id]);
  await db.query(eliminarPersona, [usuario.idPersona || usuario.idpersona]);

  return successResponse(res, 'Usuario eliminado exitosamente', {
    idUsuario: id,
    nombrecompleto: usuario.nombrecompleto,
  });
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

// EXPORTS SEGUROS
module.exports = {
  getAll: exports.getAll,
  getById: exports.getById,
  create: exports.create,
  update: exports.update,
  cambiarEstado: exports.cambiarEstado,
  delete: exports.delete,
  updateAvatar: exports.updateAvatar
};