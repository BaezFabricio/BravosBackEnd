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
/**
 * POST /api/auth/registro
 * Registra un nuevo usuario en espera de aprobación del Admin
 */
exports.registro = asyncHandler(async (req, res) => {
  // Sacamos idPerfil y tipoAlumno de aquí, ya no los necesitamos en el formulario público
  const { nombrecompleto, dni, correo, telefono, username, password } = req.body;

  // 1. Validar duplicados (Esto queda igual, es excelente)
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

  // 2. Crear persona (Datos humanos)
  const [personaResult] = await db.query(insertarPersona, [
    nombrecompleto,
    dni,
    correo,
    telefono || null,
  ]);
  const personaId = personaResult.insertId;

  // 3. Hashear contraseña
  const hashedPassword = await hashPassword(password);

  // 4. Crear usuario (Aquí aplicamos TU lógica)
  const [usuarioResult] = await db.query(insertarUsuario, [
    personaId,
    username,
    hashedPassword,
    null,        // <--- idPerfil entra como NULL (No tiene perfil asignado todavía)
    'pendiente', // <--- Estado 'pendiente' (Bloqueado hasta que el admin lo apruebe)
  ]);
  const usuarioId = usuarioResult.insertId;

  // NOTA: Quitamos los "if (idPerfil === ROLES.ALUMNO)" porque eso lo va a hacer 
  // el Administrador más adelante desde su pantalla de gestión.

  // 5. Obtener usuario creado
  const [nuevoUsuario] = await db.query(obtenerUsuarioRegistrado, [usuarioId]);

  // 6. Devolvemos respuesta de éxito (Sin token, para que vaya al Login de una)
  return successResponse(res, 'Usuario registrado. En espera de aprobación por el Administrador.', {
    usuario: nuevoUsuario[0],
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
