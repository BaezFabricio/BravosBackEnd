const db = require('../config/db');
const obtenerUsuarios = require('../data/Usuarios/ObtenerUsuarios');
const obtenerUsuarioPorId = require('../data/Usuarios/ObtenerUsuarioPorId');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
const actualizarUsuario = require('../data/Usuarios/ActualizarUsuario');
const actualizarEstadoUsuario = require('../data/Usuarios/ActualizarEstadoUsuario');
const eliminarUsuario = require('../data/Usuarios/EliminarUsuario');
const insertarPersona = require('../data/Persona/InsertarPersona');
const actualizarPersona = require('../data/Persona/ActualizarPersona');
const eliminarPersona = require('../data/Persona/EliminarPersona');
const cloudinary = require('../config/cloudinary');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { hashPassword } = require('../functions/encryption');

/**
 * GET /api/usuarios
 * Obtiene lista de todos los usuarios
 */
exports.getAll = asyncHandler(async (req, res) => {
  const [usuarios] = await db.query(obtenerUsuarios);

  return successResponse(res, 'Usuarios obtenidos correctamente', usuarios);
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
 * Crea un nuevo usuario (solo admin)
 */
exports.create = asyncHandler(async (req, res) => {
  const { nombrecompleto, dni, correo, telefono, username, password, idPerfil } = req.body;

  // Crear persona
  const [personaResult] = await db.query(insertarPersona, [
    nombrecompleto,
    dni,
    correo,
    telefono || null,
  ]);
  const personaId = personaResult.insertId;

  // Hashear contraseña
  const hashedPassword = await hashPassword(password);

  // Crear usuario
  const [usuarioResult] = await db.query(insertarUsuario, [
    personaId,
    username,
    hashedPassword,
    idPerfil,
    'activo',
  ]);

  const [nuevoUsuario] = await db.query(obtenerUsuarioPorId, [usuarioResult.insertId]);

  return successResponse(res, 'Usuario creado exitosamente', nuevoUsuario[0], 201);
});

/**
 * PUT /api/usuarios/:id
 * Actualiza datos de un usuario
 */
exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombrecompleto, correo, telefono, username } = req.body;

  // Verificar que el usuario existe
  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarioExistente[0];

  // Actualizar persona
  await db.query(actualizarPersona, [
    nombrecompleto || usuario.nombrecompleto,
    correo || usuario.correo,
    telefono || usuario.telefono,
    usuario.idpersona,
  ]);

  // Actualizar usuario si hay username nuevo
  if (username && username !== usuario.username) {
    await db.query(actualizarUsuario, [username, usuario.idPerfil, id]);
  }

  const [usuarioActualizado] = await db.query(obtenerUsuarioPorId, [id]);

  return successResponse(res, 'Usuario actualizado exitosamente', usuarioActualizado[0]);
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
 * Elimina un usuario
 */
exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [usuarioExistente] = await db.query(obtenerUsuarioPorId, [id]);
  if (usuarioExistente.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarioExistente[0];

  // Eliminar usuario y persona
  await db.query(eliminarUsuario, [id]);
  await db.query(eliminarPersona, [usuario.idpersona]);

  return successResponse(res, 'Usuario eliminado exitosamente', {
    idUsuario: id,
    nombrecompleto: usuario.nombrecompleto,
  });
});

/**
 * PUT /api/usuarios/:id/avatar
 * Actualiza la foto de perfil del usuario
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

module.exports = exports;
