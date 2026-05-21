const crypto = require('crypto'); // Generador de tokens nativo de Node.js
const db = require('../config/db');
const obtenerDatosLogin = require('../data/Auth/ObtenerDatosLogin');
const verificarCorreoExistente = require('../data/Auth/VerificarCorreoExistente');
const verificarDniExistente = require('../data/Auth/VerificarDniExistente');
const verificarUsernameExistente = require('../data/Auth/VerificarUsernameExistente');
const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
const insertarPersona = require('../data/Persona/InsertarPersona');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
// ❌ Quitamos la importación de ObtenerPermisosPorPerfil que daba error
const { hashPassword, comparePassword } = require('../functions/encryption');
const { generateToken } = require('../functions/jwt');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { sendVerificationEmail } = require('../functions/email.service'); 

/**
 * POST /api/auth/registro
 */
exports.registro = asyncHandler(async (req, res) => {
  const { nombrecompleto, dni, correo, telefono, username, password } = req.body;

  // 1. Validar duplicados
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

  // 2. Crear persona
  const [personaResult] = await db.query(insertarPersona, [
    nombrecompleto,
    dni,
    correo,
    telefono || null,
  ]);
  const personaId = personaResult.insertId;

  // 3. Hashear contraseña
  const hashedPassword = await hashPassword(password);

  // 4. Generar token único de verificación
  const tokenVerificacion = crypto.randomBytes(32).toString('hex');

  // 5. Crear usuario
  const [usuarioResult] = await db.query(insertarUsuario, [
    personaId,
    username,
    hashedPassword,
    null,               // idPerfil entra en NULL
    'pendiente',        // Estado inicial 'pendiente'
    tokenVerificacion   
  ]);
  const usuarioId = usuarioResult.insertId;

  // 6. Disparar correo de activación
  await sendVerificationEmail(correo, nombrecompleto, tokenVerificacion);

  // 7. Obtener usuario creado
  const [nuevoUsuario] = await db.query(obtenerUsuarioRegistrado, [usuarioId]);

  return successResponse(res, 'Usuario registrado. Por favor verifica tu correo electrónico para activar la cuenta.', {
    usuario: nuevoUsuario[0],
  }, 201);
});

/**
 * POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res) => {
  const { correo, password } = req.body;

  // Buscar usuario por correo (Ahora trae también p.nombrePerfil gracias al nuevo ObtenerDatosLogin)
  const [usuarios] = await db.query(obtenerDatosLogin, [correo]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  const usuario = usuarios[0];

  // Restricción de verificación de correo electrónico
  if (usuario.correo_verificado === 0) {
    return errorResponse(
      res, 
      'Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.', 
      'EMAIL_NOT_VERIFIED', 
      403
    );
  }

  // Validamos contraseña con tu función de encriptación
  const match = await comparePassword(password, usuario.contrasena);
  if (!match) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  // 1. ✨ Metemos el nombre del perfil dentro del Token JWT
  const token = generateToken({
    idUsuario: usuario.idUsuario,
    correo: usuario.correo,
    username: usuario.username,
    idPerfil: usuario.idPerfil,
    perfil: usuario.nombrePerfil // 👈 Guardamos 'admin' o lo que devuelva la base de datos
  });

  let permisos = [];
  if (usuario.idPerfil) {
    // Espacio reservado para el ABM dinámico de perfiles posterior
  }

  // 2. 🚀 Se lo mandamos limpio al Frontend en la respuesta exitosa
  return successResponse(res, 'Sesión iniciada exitosamente', {
    token,
    usuario: {
      idUsuario: usuario.idUsuario,
      nombrecompleto: usuario.nombrecompleto,
      correo: usuario.correo,
      perfil: usuario.nombrePerfil || 'cliente', // 👈 Si es NULL en la BD, asume 'cliente' por defecto
      estado: usuario.estado,
    },
    permisos,
  });
});

/**
 * GET /api/auth/me
 */
exports.me = asyncHandler(async (req, res) => {
  return successResponse(res, 'Sesión obtenida correctamente', {
    usuario: {
      idUsuario: req.user.idUsuario,
      correo: req.user.correo,
      username: req.user.username,
      idPerfil: req.user.idPerfil,
      perfil: req.user.perfil || 'cliente' // 👈 Clave para que React mantenga los accesos al recargar
    },
    permisos: [],
  });
});

/**
 * GET /api/auth/verificar/:token
 */
exports.verificarCuenta = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const [usuarios] = await db.query('SELECT idUsuario FROM usuario WHERE token_verificacion = ?', [token]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'El enlace de verificación es inválido o ya fue utilizado.', 'INVALID_TOKEN', 400);
  }

  const idUsuario = usuarios[0].idUsuario;

  await db.query(
    'UPDATE usuario SET correo_verificado = 1, token_verificacion = NULL WHERE idUsuario = ?', 
    [idUsuario]
  );

  return successResponse(res, '¡Cuenta verificada con éxito! Ya podés iniciar sesión.', null);
});

/**
 * POST /api/auth/reenviar-verificacion
 */
exports.reenviarVerificacion = asyncHandler(async (req, res) => {
  const { correo } = req.body;

  const [usuarios] = await db.query(
    'SELECT idUsuario, estado, correo_verificado FROM usuario u JOIN persona p ON u.idPersona = p.idPersona WHERE p.correo = ?', 
    [correo]
  );

  if (usuarios.length === 0) {
    return errorResponse(res, 'No existe ninguna cuenta registrada con este correo.', 'EMAIL_NOT_FOUND', 404);
  }

  const usuario = usuarios[0];

  if (usuario.correo_verificado === 1) {
    return errorResponse(res, 'Esta cuenta ya se encuentra verificada. Podés iniciar sesión.', 'ALREADY_VERIFIED', 400);
  }

  const nuevoToken = crypto.randomBytes(32).toString('hex');

  await db.query(
    'UPDATE usuario SET token_verificacion = ? WHERE idUsuario = ?',
    [nuevoToken, usuario.idUsuario]
  );

  await sendVerificationEmail(correo, 'Alumno', nuevoToken);

  return successResponse(res, 'Se ha reenviado el enlace de verificación a tu correo.', null, 200);
});

module.exports = exports;