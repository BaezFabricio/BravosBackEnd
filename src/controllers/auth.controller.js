const db = require('../config/db');
const obtenerDatosLogin = require('../data/Auth/ObtenerDatosLogin');
const verificarCorreoExistente = require('../data/Auth/VerificarCorreoExistente');
const verificarDniExistente = require('../data/Auth/VerificarDniExistente');
const verificarUsernameExistente = require('../data/Auth/VerificarUsernameExistente');
const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
const insertarPersona = require('../data/Persona/InsertarPersona');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
const insertarAlumno = require('../data/Alumno/InsertarAlumno');
const insertarProfesor = require('../data/Profesor/InsertarProfesor');
const insertarAdministrador = require('../data/Administrador/InsertarAdministrador');
const obtenerPermisosPorPerfil = require('../data/Perfil/ObtenerPermisosPorPerfil');
const { hashPassword, comparePassword } = require('../functions/encryption');
const { generateToken } = require('../functions/jwt');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { ROLES } = require('../utils/constants');

/**
 * POST /api/auth/registro
 * Registra un nuevo usuario
 */
exports.registro = asyncHandler(async (req, res) => {
  const { nombrecompleto, dni, correo, telefono, username, password, idPerfil, tipoAlumno } = req.body;

  // Validar duplicados
  const [emailExists] = await db.query(verificarCorreoExistente, [correo]);
  if (emailExists.count > 0) {
    return errorResponse(res, 'El correo ya está registrado', 'DUPLICATE_EMAIL', 409);
  }

  const [dniExists] = await db.query(verificarDniExistente, [dni]);
  if (dniExists.count > 0) {
    return errorResponse(res, 'El DNI ya está registrado', 'DUPLICATE_DNI', 409);
  }

  const [usernameExists] = await db.query(verificarUsernameExistente, [username]);
  if (usernameExists.count > 0) {
    return errorResponse(res, 'El nombre de usuario ya está registrado', 'DUPLICATE_USERNAME', 409);
  }

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
  const usuarioId = usuarioResult.insertId;

  // Crear registro según tipo de perfil
  if (idPerfil === ROLES.ALUMNO) {
    await db.query(insertarAlumno, [personaId, tipoAlumno || 'amateur', 'activo']);
  } else if (idPerfil === ROLES.PROFESOR) {
    await db.query(insertarProfesor, [personaId, 'General']);
  } else if (idPerfil === ROLES.ADMINISTRADOR) {
    await db.query(insertarAdministrador, [personaId]);
  }

  // Obtener usuario creado
  const [nuevoUsuario] = await db.query(obtenerUsuarioRegistrado, [usuarioId]);

  // Generar JWT
  const token = generateToken({
    idUsuario: nuevoUsuario[0].idUsuario,
    correo: nuevoUsuario[0].correo,
    username: nuevoUsuario[0].username,
    idPerfil: idPerfil,
  });

  const [permisos] = await db.query(obtenerPermisosPorPerfil, [idPerfil]);

  return successResponse(res, 'Usuario registrado exitosamente', {
    token,
    usuario: nuevoUsuario[0],
    permisos,
  }, 201);
});

/**
 * POST /api/auth/login
 * Inicia sesión de usuario
 */
exports.login = asyncHandler(async (req, res) => {
  const { correo, password } = req.body;

  // Buscar usuario por correo
  const [usuarios] = await db.query(obtenerDatosLogin, [correo]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  const usuario = usuarios[0];

  // Comparar contraseña
  const isPasswordValid = await comparePassword(password, usuario.contrasena);
  if (!isPasswordValid) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  // Generar JWT
  const token = generateToken({
    idUsuario: usuario.idUsuario,
    correo: usuario.correo,
    username: usuario.username,
    idPerfil: usuario.idPerfil,
  });

  const [permisos] = await db.query(obtenerPermisosPorPerfil, [usuario.idPerfil]);

  return successResponse(res, 'Sesión iniciada exitosamente', {
    token,
    usuario: {
      idUsuario: usuario.idUsuario,
      nombrecompleto: usuario.nombrecompleto,
      correo: usuario.correo,
      perfil: usuario.nombrePerfil,
      estado: usuario.estado,
    },
    permisos,
  });
});

/**
 * GET /api/auth/me
 * Devuelve la sesión actual junto con permisos
 */
exports.me = asyncHandler(async (req, res) => {
  const [permisos] = await db.query(obtenerPermisosPorPerfil, [req.user.idPerfil]);

  return successResponse(res, 'Sesión obtenida correctamente', {
    usuario: {
      idUsuario: req.user.idUsuario,
      correo: req.user.correo,
      username: req.user.username,
      idPerfil: req.user.idPerfil,
    },
    permisos,
  });
});

module.exports = exports;
