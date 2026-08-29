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
const { crearNotificacion, crearNotificacionAdmins } = require('../functions/notificacion.service');
const { generateToken } = require('../functions/jwt');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { sendVerificationEmail } = require('../functions/email.service'); 
const { sendRecoveryEmail } = require('../functions/email.service'); 
// Almacenamiento temporal en memoria para códigos de recuperación (dev)
const recoveryStore = new Map(); // key: email, value: { code, expiresAt }

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

    crearNotificacionAdmins('sistema',
      'Nuevo registro pendiente',
      `${nombrecompleto} (${correo}) se registró y está pendiente de verificación de correo.`,
      '/admin/usuarios'
    );
    crearNotificacion(usuarioId, 'sistema',
      '¡Bienvenido a Bravos Box!',
      `Hola ${nombrecompleto}, tu cuenta fue creada. Revisá tu correo para verificarla y empezar a entrenar.`
    );

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

  // 1. 🟢 CONTROL DE ESTADO EXPLICITO: Si obtenerDatosLogin no traía el estado, lo buscamos acá
  const [checkUser] = await db.query('SELECT estado FROM usuario WHERE idUsuario = ?', [usuario.idUsuario]);
  const estadoReal = checkUser[0]?.estado || usuario.estado || 'activo';

  // 2. 🟢 BUSCAMOS LOS PERMISOS REALES EN TU TABLA INTERMEDIA
  const sqlPermisos = `
    SELECT p.modulo, p.accion 
    FROM perfilpermiso pp
    INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
    WHERE pp.idPerfil = ?
  `;
  const [misPermisos] = await db.query(sqlPermisos, [usuario.idPerfil]);

  // 3. 🟢 Formateamos los strings correspondientes (ej: "usuarios:alta")
  const listaPermisosFormateada = [];
  misPermisos.forEach(per => {
    const mod = per.modulo.toLowerCase();
    const acc = per.accion.toLowerCase();
    
    listaPermisosFormateada.push(`${mod}:${acc}`);
    
    if (acc === 'consulta') {
      listaPermisosFormateada.push(`${mod}:ver`);
    }
  });

  // 3.5 🟢 RESOLVEMOS LA IDENTIDAD REAL DE ESTA PERSONA (profesor/alumno)
  // El token solo traía idUsuario/idPerfil, por eso el panel de profesor caía siempre a idProfesor = 1.
  // Buscamos por idPersona; si hay registros duplicados tomamos el más antiguo (menor id).
  let idProfesor = null;
  let idAlumno = null;

  if (usuario.idPersona) {
    const [profesorRows] = await db.query(
      'SELECT idProfesor FROM profesor WHERE idPersona = ? ORDER BY idProfesor ASC LIMIT 1',
      [usuario.idPersona]
    );
    idProfesor = profesorRows[0]?.idProfesor ?? null;

    const [alumnoRows] = await db.query(
      'SELECT idAlumno FROM alumno WHERE idPersona = ? ORDER BY idAlumno ASC LIMIT 1',
      [usuario.idPersona]
    );
    idAlumno = alumnoRows[0]?.idAlumno ?? null;
  }

  const token = generateToken({
    idUsuario: usuario.idUsuario,
    correo: usuario.correo,
    username: usuario.username,
    idPerfil: usuario.idPerfil,
    perfil: usuario.nombrePerfil,
    idProfesor,
    idAlumno
  });

  // 4. 🚀 Devolvemos la respuesta impecable al Frontend
  return successResponse(res, 'Sesión iniciada exitosamente', {
    token,
    usuario: {
      idUsuario: usuario.idUsuario,
      nombrecompleto: usuario.nombrecompleto,
      correo: usuario.correo,
      perfil: usuario.nombrePerfil || 'admin 2',
      estado: estadoReal, // 👈 Ahora viaja 'activo' sí o sí
      avatarUrl: usuario.avatarUrl || null,
      idProfesor, // 👈 el panel de profesor ya no cae a 1 fijo
      idAlumno,
    },
    permisos: listaPermisosFormateada, // 👈 Ahora el array viaja con tus datos de MySQL
  });
});

/**
 * GET /api/auth/me
 */
exports.me = asyncHandler(async (req, res) => {
  // Capturamos el ID de forma segura desde req.user
  const idUsuarioReal = req.user?.idUsuario;

  if (!idUsuarioReal) {
    return errorResponse(res, 'Token inválido o sesión expirada.', 'UNAUTHORIZED', 401);
  }

  // 🟢 SOLUCIÓN DIRECTA: Cableamos la query nativa de Sofía para evitar el archivo externo roto/undefined
 const sqlUsuario = `
    SELECT 
      u.idUsuario, 
      u.username, 
      u.estado, 
      u.idPerfil, 
      p.fecha_registro AS miembroDesde, -- 👈 Mapea la fecha real desde la tabla persona
      p.nombrecompleto, 
      p.correo, 
      p.dni, 
      p.telefono,
      perf.nombrePerfil,
      av.url AS avatarUrl
    FROM usuario u
    INNER JOIN persona p ON u.idPersona = p.idPersona
    LEFT JOIN perfil perf ON u.idPerfil = perf.idPerfil
    LEFT JOIN usuario_avatar av ON u.idUsuario = av.idUsuario
    WHERE u.idUsuario = ?
  `;
  // Ejecutamos la consulta pasándole la estructura limpia
  const [usuarios] = await db.query(sqlUsuario, [idUsuarioReal]);

  if (!usuarios || usuarios.length === 0) {
    return errorResponse(res, 'Usuario no encontrado en el sistema.', 'USER_NOT_FOUND', 404);
  }

  const usuarioReal = usuarios[0];
  const idPerfilReal = usuarioReal.idPerfil;

  // 1. Buscamos los permisos granulares asociados a su perfil (ID 9 - Alumno)
  const sqlPermisos = `
    SELECT p.modulo, p.accion 
    FROM perfilpermiso pp
    INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
    WHERE pp.idPerfil = ?
  `;
  const [misPermisos] = await db.query(sqlPermisos, [idPerfilReal]);

  // 2. 🟢 ARMAMOS EL ARRAY EN EL FORMATO "modulo:accion" QUE PIDEN TU LANDING Y PANELES
  const arrayPermisos = [];
  
  misPermisos.forEach(per => {
    const mod = per.modulo.toLowerCase().trim();
    const acc = per.accion.toLowerCase().trim();
    
    // Inyectamos el formato básico (ej: "usuarios:alta")
    arrayPermisos.push(`${mod}:${acc}`);
    
    // Si la acción es consulta, le sumamos el alias 'ver' por retrocompatibilidad con las vistas
    if (acc === 'consulta' || acc === 'ver') {
      if (!arrayPermisos.includes(`${mod}:consulta`)) arrayPermisos.push(`${mod}:consulta`);
      if (!arrayPermisos.includes(`${mod}:ver`)) arrayPermisos.push(`${mod}:ver`);
    }
  });

  // 3. Devolvemos la respuesta estructurada al Frontend
  return successResponse(res, 'Sesión obtenida correctamente', {
    usuario: {
      idUsuario: usuarioReal.idUsuario,
      nombrecompleto: usuarioReal.nombrecompleto,
      correo: usuarioReal.correo,
      username: usuarioReal.username,
      idPerfil: idPerfilReal,
      perfil: usuarioReal.nombrePerfil || 'Alumno',
      estado: usuarioReal.estado,
      avatarUrl: usuarioReal.avatarUrl || null, // 🟢 Si está vacío en la DB manda null, evitando el aviso del string ("")
      dni: usuarioReal.dni || null,
      telefono: usuarioReal.telefono || null,
      miembroDesde: usuarioReal.miembroDesde || null, // 🟢 Inyectamos la fecha para que no salga el guion vacío
    },
    permisos: arrayPermisos, 
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

  const correoNormalizado = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  const nuevoCorreoNormalizado = typeof nuevoCorreo === 'string' ? nuevoCorreo.trim().toLowerCase() : '';

  let usuarioId = idUsuario;
  let correoDestino = nuevoCorreoNormalizado || correoNormalizado;

  if (!correoDestino) {
    return errorResponse(res, 'El correo es requerido para reenviar la verificación.', 'MISSING_EMAIL', 400);
  }

  if (nuevoCorreoNormalizado) {
    const [emailExists] = await db.query(
      'SELECT p.idPersona FROM persona p JOIN usuario u ON p.idPersona = u.idPersona WHERE LOWER(TRIM(p.correo)) = LOWER(TRIM(?)) AND u.idUsuario != ?', 
      [nuevoCorreoNormalizado, usuarioId]
    );
    if (emailExists && emailExists.length > 0) {
      return errorResponse(res, 'El nuevo correo electrónico ya está siendo usado por otra cuenta.', 'DUPLICATE_EMAIL', 409);
    }

    await db.query(
      'UPDATE persona p JOIN usuario u ON p.idPersona = u.idPersona SET p.correo = ? WHERE u.idUsuario = ?', 
      [nuevoCorreoNormalizado, usuarioId]
    );
  }

  const queryBuscar = usuarioId
    ? 'SELECT u.idUsuario, p.nombrecompleto, u.correo_verificado, p.correo FROM usuario u JOIN persona p ON u.idPersona = p.idPersona WHERE u.idUsuario = ?'
    : 'SELECT u.idUsuario, p.nombrecompleto, u.correo_verificado, p.correo FROM usuario u JOIN persona p ON u.idPersona = p.idPersona WHERE LOWER(TRIM(p.correo)) = LOWER(TRIM(?)) OR LOWER(TRIM(u.username)) = LOWER(TRIM(?))';

  const parametrosBuscar = usuarioId ? [usuarioId] : [correoNormalizado, correoNormalizado];
  const [usuarios] = await db.query(queryBuscar, parametrosBuscar);

  if (!usuarios || usuarios.length === 0) {
    return errorResponse(res, 'No se encontró ninguna cuenta asociada para enviar la verificación.', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarios[0];

  const nuevoToken = crypto.randomBytes(32).toString('hex');

  await db.query(
    'UPDATE usuario SET token_verificacion = ? WHERE idUsuario = ?',
    [nuevoToken, usuario.idUsuario]
  );

  await sendVerificationEmail(correoDestino, usuario.nombrecompleto, nuevoToken);

  return successResponse(res, 'Se ha enviado el código de verificación de forma exitosa.', { correoActualizado: correoDestino }, 200);
});

module.exports = exports;

/**
 * POST /api/auth/recuperar-contrasena
 * Maneja acciones: send_code, verify_code, reset_password
 */
exports.recuperarContrasena = asyncHandler(async (req, res) => {
  const { email, action, code, password } = req.body;

  if (!email) return errorResponse(res, 'El correo es requerido', 'MISSING_EMAIL', 400);

  // Comprobamos si existe la persona/usuario
  const [personas] = await db.query('SELECT p.*, u.idUsuario FROM persona p LEFT JOIN usuario u ON p.idPersona = u.idPersona WHERE p.correo = ?', [email]);
  if (!personas || personas.length === 0) {
    return errorResponse(res, 'No se encontró una cuenta asociada a ese correo', 'USER_NOT_FOUND', 404);
  }

  const persona = personas[0];

  if (action === 'send_code') {
    // Generar código de 6 dígitos
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos

    recoveryStore.set(email, { code: newCode, expiresAt });

    // Enviamos el correo con el código
    await sendRecoveryEmail(email, persona.nombrecompleto, newCode);

    return successResponse(res, 'Código enviado al correo', null, 200);
  }

  if (action === 'verify_code') {
    const entry = recoveryStore.get(email);
    if (!entry) return errorResponse(res, 'Código no encontrado o expirado', 'CODE_NOT_FOUND', 400);
    if (Date.now() > entry.expiresAt) {
      recoveryStore.delete(email);
      return errorResponse(res, 'El código expiró', 'CODE_EXPIRED', 400);
    }
    if (entry.code !== String(code)) return errorResponse(res, 'Código inválido', 'INVALID_CODE', 400);

    return successResponse(res, 'Código verificado', null, 200);
  }

  if (action === 'reset_password') {
    if (!password) return errorResponse(res, 'La nueva contraseña es requerida', 'MISSING_PASSWORD', 400);

    const entry = recoveryStore.get(email);
    if (!entry) return errorResponse(res, 'Código no encontrado o expirado', 'CODE_NOT_FOUND', 400);
    if (Date.now() > entry.expiresAt) {
      recoveryStore.delete(email);
      return errorResponse(res, 'El código expiró', 'CODE_EXPIRED', 400);
    }
    if (entry.code !== String(code)) return errorResponse(res, 'Código inválido', 'INVALID_CODE', 400);

    // Hasheamos la nueva contraseña
    const hashed = await hashPassword(password);

    // Actualizamos contraseña y verificamos la cuenta (el código confirma propiedad del correo)
    const [updateResult] = await db.query(
      'UPDATE usuario u JOIN persona p ON u.idPersona = p.idPersona SET u.contrasena = ?, u.correo_verificado = 1 WHERE p.correo = ?',
      [hashed, email]
    );

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, 'No se encontró la cuenta asociada a ese correo', 'USER_NOT_FOUND', 404);
    }

    // Limpiamos el código
    recoveryStore.delete(email);

    return successResponse(res, 'Contraseña actualizada correctamente', null, 200);
  }

  return errorResponse(res, 'Acción inválida', 'INVALID_ACTION', 400);
});

/**
 * POST /api/auth/cambiar-contraseña
 * Permite a un usuario autenticado cambiar su contraseña
 */
exports.cambiarContrasena = asyncHandler(async (req, res) => {
  const { contrasenaActual, contrasenaNueva } = req.body;
  const idUsuarioReal = req.user?.idUsuario;

  // Validaciones
  if (!idUsuarioReal) {
    return errorResponse(res, 'Token inválido o sesión expirada.', 'UNAUTHORIZED', 401);
  }

  if (!contrasenaActual || !contrasenaNueva) {
    return errorResponse(res, 'La contraseña actual y la nueva son requeridas', 'MISSING_PASSWORD', 400);
  }

  if (contrasenaNueva.length < 6) {
    return errorResponse(res, 'La nueva contraseña debe tener al menos 6 caracteres', 'PASSWORD_TOO_SHORT', 400);
  }

  // Obtener el usuario y su contraseña actual
  const [usuarios] = await db.query('SELECT u.contrasena FROM usuario u WHERE u.idUsuario = ?', [idUsuarioReal]);

  if (!usuarios || usuarios.length === 0) {
    return errorResponse(res, 'Usuario no encontrado', 'USER_NOT_FOUND', 404);
  }

  const usuario = usuarios[0];

  // Verificar que la contraseña actual es correcta
  const esValida = await comparePassword(contrasenaActual, usuario.contrasena);
  if (!esValida) {
    return errorResponse(res, 'Ruta no encontrada', 'INVALID_PASSWORD', 401);
  }

  // Hashear la nueva contraseña
  const contrasenaNuevaHasheada = await hashPassword(contrasenaNueva);

  // Actualizar la contraseña
  await db.query('UPDATE usuario SET contrasena = ? WHERE idUsuario = ?', [contrasenaNuevaHasheada, idUsuarioReal]);

  return successResponse(res, 'Contraseña cambiada exitosamente', null, 200);

  exports.getClasesDelProfesor = async (req, res) =>{
    const { idProfesor } = req.params;
    try {
        // Asumiendo que usas tu configuración de db.js
        const [clases] = await db.query(
            `SELECT c.idClase, c.nombreClase, h.dia, h.horaInicio, h.horaFin 
             FROM clase c 
             JOIN horarioclase h ON c.idClase = h.idClase 
             WHERE c.idProfesor = ?`,
            [idProfesor]
        );
        res.status(200).json(clases);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener clases del profesor", error });
    }
};
});