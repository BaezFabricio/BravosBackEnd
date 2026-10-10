const crypto = require('crypto'); // Generador de tokens nativo de Node.js
const db = require('../config/db');
const obtenerDatosLogin = require('../data/Auth/ObtenerDatosLogin');
const verificarCorreoExistente = require('../data/Auth/VerificarCorreoExistente');
const verificarDniExistente = require('../data/Auth/VerificarDniExistente');
const verificarUsernameExistente = require('../data/Auth/VerificarUsernameExistente');
const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
const insertarPersona = require('../data/Persona/InsertarPersona');
const { registrarConsentimiento } = require('../functions/consentimiento');
const insertarUsuario = require('../data/Usuarios/InsertarUsuario');
const { hashPassword, comparePassword } = require('../functions/encryption');
const { crearNotificacion, crearNotificacionAdmins } = require('../functions/notificacion.service');
const { generateToken } = require('../functions/jwt');
const { guardarSesion, borrarSesion } = require('../functions/sesionCookie');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { sendVerificationEmail } = require('../functions/email.service'); 
const { sendRecoveryEmail } = require('../functions/email.service'); 
// Almacenamiento temporal en memoria para códigos de recuperación (dev)
const recuperacion = require('../functions/recuperacion');
const versionSesion = require('../functions/versionSesion');

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

    // Constancia de la aceptación (el validador ya exigió aceptaTerminos === true)
    await registrarConsentimiento(connection, { idUsuario: usuarioId, tipo: 'terminos_y_privacidad', ip: req.ip });

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
  const [checkUser] = await db.query('SELECT estado, sesion_version FROM usuario WHERE idUsuario = ?', [usuario.idUsuario]);
  const estadoReal = checkUser[0]?.estado || usuario.estado || 'activo';

  if (estadoReal === 'inactivo') {
    return res.status(403).json({
      message: 'Tu cuenta está desactivada. Contactá al administrador del gimnasio para reactivarla.',
      code: 'CUENTA_INACTIVA',
    });
  }

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
    idAlumno,
    sv: Number(checkUser[0]?.sesion_version) || 0, // versión de sesión: cambia al cambiar la contraseña
  });

  // 4. 🚀 Devolvemos la respuesta impecable al Frontend
  guardarSesion(res, token); // el token va solo en la cookie httpOnly, no en el cuerpo de la respuesta
  return successResponse(res, 'Sesión iniciada exitosamente', {
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
 * POST /api/auth/logout — borra la cookie de sesión
 */
exports.logout = asyncHandler(async (req, res) => {
  borrarSesion(res);
  return successResponse(res, 'Sesión cerrada', null, 200);
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
 * POST /api/auth/recuperar-contrasena  (pública a propósito)
 * Recuperación con enlace de un solo uso (ver functions/recuperacion.js). Acciones:
 *  - send_link { email }: si la cuenta existe, envía el enlace. Siempre responde lo mismo, para que
 *    nadie pueda averiguar qué correos están registrados.
 *  - check_token { token }: dice si el enlace sigue sirviendo (para mostrar el formulario o un aviso).
 *  - reset_password { token, password }: cambia la contraseña y anula el enlace.
 */
const RESPUESTA_ENVIO = 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.';
const RESPUESTA_ENLACE_INVALIDO = ['El enlace no es válido o ya venció. Pedí uno nuevo.', 'INVALID_TOKEN'];

exports.recuperarContrasena = asyncHandler(async (req, res) => {
  const { action } = req.body || {};

  if (action === 'send_link') {
    const email = String(req.body.email || '').trim();
    if (!email) return errorResponse(res, 'El correo es requerido', 'MISSING_EMAIL', 400);

    const [cuentas] = await db.query(
      `SELECT u.idUsuario, p.nombrecompleto
       FROM persona p INNER JOIN usuario u ON u.idPersona = p.idPersona
       WHERE p.correo = ?
       LIMIT 1`,
      [email]
    );
    if (cuentas.length === 0) return successResponse(res, RESPUESTA_ENVIO, null, 200);

    const cuenta = cuentas[0];
    if (await recuperacion.pidioHacePoco(cuenta.idUsuario)) {
      return errorResponse(res, 'Ya te enviamos un enlace hace instantes. Esperá un minuto para pedir otro.', 'LINK_COOLDOWN', 429);
    }
    const token = await recuperacion.crearToken(cuenta.idUsuario);
    await sendRecoveryEmail(email, cuenta.nombrecompleto, token, recuperacion.DURACION_MIN);
    return successResponse(res, RESPUESTA_ENVIO, null, 200);
  }

  if (action === 'check_token') {
    const vigente = await recuperacion.buscarTokenVigente(req.body.token);
    if (!vigente) return errorResponse(res, RESPUESTA_ENLACE_INVALIDO[0], RESPUESTA_ENLACE_INVALIDO[1], 400);
    return successResponse(res, 'Enlace válido', null, 200);
  }

  if (action === 'reset_password') {
    const { token, password } = req.body;
    const problema = recuperacion.problemaContrasena(password);
    if (problema) return errorResponse(res, problema, 'WEAK_PASSWORD', 400);

    const vigente = await recuperacion.buscarTokenVigente(token);
    if (!vigente) return errorResponse(res, RESPUESTA_ENLACE_INVALIDO[0], RESPUESTA_ENLACE_INVALIDO[1], 400);

    const hashed = await hashPassword(password);
    const conexion = await db.getConnection();
    try {
      await conexion.beginTransaction();
      // Se anula primero: si llegan dos pedidos con el mismo enlace, solo uno cambia la contraseña
      if (!(await recuperacion.consumirToken(vigente.idRecuperacion, conexion))) {
        await conexion.rollback();
        return errorResponse(res, RESPUESTA_ENLACE_INVALIDO[0], RESPUESTA_ENLACE_INVALIDO[1], 400);
      }
      // El enlace llegó al correo: eso también confirma que el correo es suyo
      // También sube la versión de sesión: se cierran todas las sesiones abiertas con la contraseña vieja
      await conexion.query(
        'UPDATE usuario SET contrasena = ?, correo_verificado = 1, sesion_version = sesion_version + 1 WHERE idUsuario = ?',
        [hashed, vigente.idUsuario]
      );
      await conexion.commit();
      versionSesion.olvidarVersion(vigente.idUsuario);
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
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

  // Misma exigencia que al recuperar la contraseña (8+ caracteres, mayúscula, minúscula y número)
  const problema = recuperacion.problemaContrasena(contrasenaNueva);
  if (problema) {
    return errorResponse(res, problema, 'WEAK_PASSWORD', 400);
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
    return errorResponse(res, 'La contraseña actual no es correcta', 'INVALID_PASSWORD', 401);
  }

  // Hashear la nueva contraseña
  const contrasenaNuevaHasheada = await hashPassword(contrasenaNueva);

  // Actualizar la contraseña
  await db.query('UPDATE usuario SET contrasena = ? WHERE idUsuario = ?', [contrasenaNuevaHasheada, idUsuarioReal]);

  // Se cierran las sesiones de los otros dispositivos; esta se renueva con la versión nueva
  const versionNueva = await versionSesion.invalidarSesiones(idUsuarioReal);
  const { iat, exp, ...datosSesion } = req.user; // eslint-disable-line no-unused-vars
  guardarSesion(res, generateToken({ ...datosSesion, sv: versionNueva }));

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