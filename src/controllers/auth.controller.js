const crypto = require('crypto'); // Generador de tokens nativo de Node.js
const db = require('../config/db');
const obtenerDatosLogin = require('../data/Auth/ObtenerDatosLogin');
const verificarCorreoExistente = require('../data/Auth/VerificarCorreoExistente');
const verificarDniExistente = require('../data/Auth/VerificarDniExistente');
const verificarUsernameExistente = require('../data/Auth/VerificarUsernameExistente');
const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
const insertarPersona = require('../data/Persona/InsertarPersona');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
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

  // 1. 🛡️ VALIDACIONES ESTRICTAS DE DUPLICADOS CON RESPUESTAS ESPECÍFICAS
  const [emailExists] = await db.query(verificarCorreoExistente, [correo]);
  if (emailExists && emailExists[0]?.count > 0) {
    return errorResponse(res, 'El correo electrónico ya se encuentra registrado.', 'DUPLICATE_EMAIL', 409);
  }

  const [dniExists] = await db.query(verificarDniExistente, [dni]);
  if (dniExists && dniExists[0]?.count > 0) {
    return errorResponse(res, 'El DNI ingresado ya se encuentra registrado.', 'DUPLICATE_DNI', 409);
  }

  const [usernameExists] = await db.query(verificarUsernameExistente, [username]);
  if (usernameExists && usernameExists[0]?.count > 0) {
    return errorResponse(res, 'El nombre de usuario ya está en uso.', 'DUPLICATE_USERNAME', 409);
  }

  // Verificar si el teléfono ya está registrado
  if (telefono) {
    const [telefonoExists] = await db.query('SELECT COUNT(*) as count FROM persona WHERE telefono = ?', [telefono]);
    if (telefonoExists && telefonoExists[0]?.count > 0) {
      return errorResponse(res, 'El número de teléfono ya está registrado', 'DUPLICATE_TELEFONO', 409);
    }
  }

  // 2. 🧱 CONTROL DE TRANSACCIÓN NATIVA: Soluciona el error ER_UNSUPPORTED_PS
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Crear persona usando la conexión dedicada
    const [personaResult] = await connection.query(insertarPersona, [
      nombrecompleto,
      dni,
      correo,
      telefono || null,
    ]);
    const personaId = personaResult.insertId;

    // Hashear contraseña
    const hashedPassword = await hashPassword(password);

    // Generar token único de verificación
    const tokenVerificacion = crypto.randomBytes(32).toString('hex');

    // Crear usuario usando la conexión dedicada
    const [usuarioResult] = await connection.query(insertarUsuario, [
      personaId,
      username,
      hashedPassword,
      null,               // idPerfil entra en NULL
      'pendiente',        // Estado inicial 'pendiente'
      tokenVerificacion   
    ]);
    const usuarioId = usuarioResult.insertId;

    // Disparar correo de activación antes de confirmar en la Base de Datos
    await sendVerificationEmail(correo, nombrecompleto, tokenVerificacion);

    // 🚀 Si todo salió bien, guardamos los cambios de forma permanente en la BD
    await connection.commit();
    connection.release(); // Liberamos la conexión para que vuelva al pool

    // Obtener usuario creado (volvemos a usar 'db' normalmente)
    const [nuevoUsuario] = await db.query(obtenerUsuarioRegistrado, [usuarioId]);

    return successResponse(res, 'Usuario registrado. Por favor verifica tu correo electrónico para activar la cuenta.', {
      usuario: nuevoUsuario[0],
    }, 201);

  } catch (error) {
    // ↩️ Si algo falla, cancelamos todo el registro y limpiamos la línea para no dejar basura
    await connection.rollback();
    connection.release();
    
    console.error("Error en el proceso de registro:", error);
    return errorResponse(res, 'No se pudo completar el registro. Inténtalo de nuevo.', 'REGISTRATION_FAILED', 500);
  }
});

/**
 * POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res) => {
  const { correo, password } = req.body;

  const [usuarios] = await db.query(obtenerDatosLogin, [correo]);

  if (usuarios.length === 0) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  const usuario = usuarios[0];

  if (usuario.correo_verificado === 0) {
    return errorResponse(
      res, 
      'Debes verificar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.', 
      'EMAIL_NOT_VERIFIED', 
      403
    );
  }

  const match = await comparePassword(password, usuario.contrasena);
  if (!match) {
    return errorResponse(res, 'Correo o contraseña inválidos', 'INVALID_CREDENTIALS', 401);
  }

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    correo: usuario.correo,
    username: usuario.username,
    idPerfil: usuario.idPerfil,
    perfil: usuario.nombrePerfil 
  });

  return successResponse(res, 'Sesión iniciada exitosamente', {
    token,
    usuario: {
      idUsuario: usuario.idUsuario,
      nombrecompleto: usuario.nombrecompleto,
      correo: usuario.correo,
      perfil: usuario.nombrePerfil || 'cliente', 
      estado: usuario.estado,
    },
    permisos: [],
  });
});

/**
 * GET /api/auth/me
 */
exports.me = asyncHandler(async (req, res) => {
  const [usuarios] = await db.query(obtenerUsuarioRegistrado, [req.user.idUsuario]);

  // 2. Si por alguna razón el token es válido pero el usuario no existe en la BD
  if (!usuarios || usuarios.length === 0) {
    return errorResponse(res, 'Usuario no encontrado en el sistema.', 'USER_NOT_FOUND', 404);
  }

  const usuarioReal = usuarios[0];

  // 3. Devolvemos la respuesta estructurada con los datos de tu Base de Datos
  return successResponse(res, 'Sesión obtenida correctamente', {
    usuario: {
      idUsuario: usuarioReal.idUsuario,
      nombrecompleto: usuarioReal.nombrecompleto, // <-- ¡Ahora sí viaja el nombre real!
      correo: usuarioReal.correo,                 // <-- Mail real de la tabla persona
      username: usuarioReal.username,             // <-- Username real
      idPerfil: req.user.idPerfil,                // <-- Mantenemos el ID de perfil del token
      perfil: usuarioReal.perfil || 'cliente',    // <-- Perfil mapeado desde la base de datos
      estado: usuarioReal.estado
    },
    permisos: [], // Espacio listo si manejás roles/permisos más adelante
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
 * ✨ PERMITE ACTUALIZAR EL CORREO SI EL USUARIO SE EQUIVOCÓ
 */
exports.reenviarVerificacion = asyncHandler(async (req, res) => {
  const { correo, nuevoCorreo, idUsuario } = req.body; 

  let usuarioId = idUsuario;
  let correoDestino = nuevoCorreo || correo;

  if (nuevoCorreo) {
    const [emailExists] = await db.query(
      'SELECT p.idPersona FROM persona p JOIN usuario u ON p.idPersona = u.idPersona WHERE p.correo = ? AND u.idUsuario != ?', 
      [nuevoCorreo, usuarioId]
    );
    if (emailExists && emailExists.length > 0) {
      return errorResponse(res, 'El nuevo correo electrónico ya está siendo usado por otra cuenta.', 'DUPLICATE_EMAIL', 409);
    }

    await db.query(
      'UPDATE persona p JOIN usuario u ON p.idPersona = u.idPersona SET p.correo = ? WHERE u.idUsuario = ?', 
      [nuevoCorreo, usuarioId]
    );
  }

  const queryBuscar = nuevoCorreo 
    ? 'SELECT u.idUsuario, p.nombrecompleto, u.correo_verificado FROM usuario u JOIN persona p ON u.idPersona = p.idPersona WHERE u.idUsuario = ?'
    : 'SELECT u.idUsuario, p.nombrecompleto, u.correo_verificado FROM usuario u JOIN persona p ON u.idPersona = p.idPersona WHERE p.correo = ?';
  
  const parametrosBuscar = nuevoCorreo ? [usuarioId] : [correo];
  const [usuarios] = await db.query(queryBuscar, parametrosBuscar);

  if (!usuarios || usuarios.length === 0) {
    return errorResponse(res, 'No se encontró ninguna cuenta asociada para enviar la verificación.', 'USER_NOT_FOUND', 404);
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

  await sendVerificationEmail(correoDestino, usuario.nombrecompleto, nuevoToken);

  return successResponse(res, 'Se ha enviado el código de verificación de forma exitosa.', { correoActualizado: correoDestino }, 200);
});

module.exports = exports;