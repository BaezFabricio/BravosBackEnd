const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { generar, iaConfigurada } = require('../functions/bravoIA/gemini');
const { pareceDelTema } = require('../functions/bravoIA/filtroTema');
const { instrucciones, interpretarRespuesta } = require('../functions/bravoIA/prompt');
const { datosDelAlumno } = require('../functions/bravoIA/datosAlumno');

const MAX_PREGUNTA = 400;
// Tope de consultas al modelo por día (todas las personas juntas), para no gastar la cuota gratuita de golpe
const TOPE_DIARIO = Number(process.env.BRAVO_IA_MAX_DIA) || 800;
const contador = { dia: '', usadas: 0 };

function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}
function topeAlcanzado() {
  const hoy = hoyAR();
  if (contador.dia !== hoy) { contador.dia = hoy; contador.usadas = 0; }
  return contador.usadas >= TOPE_DIARIO;
}
const contarUso = () => { contador.usadas += 1; };

// Módulos de permiso que dan acceso a cada panel (mismo criterio que el frontend: src/lib/paneles.js)
const MODULOS_ADMIN = ['usuarios', 'dashboard', 'perfiles', 'membresias', 'clases', 'reservas', 'creditos', 'configuracion'];

async function panelesDelPerfil(idPerfil) {
  const [filas] = await db.query(
    `SELECT LOWER(p.modulo) AS modulo
       FROM perfilpermiso pp INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
      WHERE pp.idPerfil = ?`,
    [idPerfil]
  );
  const modulos = filas.map((f) => f.modulo);
  return {
    alumno: modulos.some((m) => m.startsWith('alumno')),
    admin: Number(idPerfil) === 1 || modulos.some((m) => MODULOS_ADMIN.includes(m)),
  };
}

// Consulta mínima (pocos tokens) para no rechazar por error preguntas que no traen palabras del sistema
async function esDelTema(pregunta) {
  contarUso();
  const respuesta = await generar({
    system: 'Clasificás preguntas. Respondé únicamente la palabra SI o la palabra NO.',
    usuario:
      'Un alumno o administrador de un gimnasio de CrossFit escribe en el chat de ayuda de su sistema de gestión. ' +
      '¿Su pregunta tiene que ver con el gimnasio o con el uso del sistema (clases, reservas, créditos, membresías, pagos, ' +
      'rutinas, entrenamiento, horarios, ausencias o viajes que afectan sus clases, la app)?\n' +
      `Pregunta: «${pregunta}»`,
    maxTokens: 16,
    temperatura: 0,
    timeoutMs: 8000,
  });
  return /^\s*s[ií]/i.test(respuesta);
}

/**
 * POST /bravo/preguntar
 * Body: { pregunta, rol: 'alumno' | 'admin', mascota?: 'Bravo' | 'Milo' }
 *
 * Responde { ia: false } cuando la IA no está disponible (sin clave, tope diario, error de Google): el
 * frontend usa entonces su motor de respuestas fijas. { ia: true, fueraDeTema: true } si no es del tema.
 * El asistente solo LEE: no modifica nada. Los datos personales salen siempre del token de la sesión.
 */
exports.preguntar = asyncHandler(async (req, res) => {
  const pregunta = String(req.body?.pregunta ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!pregunta) {
    return errorResponse(res, 'Escribí tu pregunta.', 'INVALID_INPUT', 400);
  }
  if (pregunta.length > MAX_PREGUNTA) {
    return errorResponse(res, `Tu pregunta es muy larga (máximo ${MAX_PREGUNTA} caracteres).`, 'INVALID_INPUT', 400);
  }

  const panel = req.body?.rol === 'admin' ? 'admin' : req.body?.rol === 'alumno' ? 'alumno' : null;
  if (!panel) {
    return errorResponse(res, 'Panel no válido.', 'INVALID_INPUT', 400);
  }

  // El panel que pide el navegador es solo una sugerencia: se comprueba contra los permisos reales del perfil
  const permitidos = await panelesDelPerfil(req.user.idPerfil);
  if (!permitidos[panel]) {
    return errorResponse(res, 'Tu perfil no tiene acceso a este asistente.', 'FORBIDDEN', 403);
  }

  const mascota = req.body?.mascota === 'Milo' ? 'Milo' : 'Bravo';

  if (!iaConfigurada() || topeAlcanzado()) {
    return successResponse(res, 'Asistente con respuestas fijas', { ia: false });
  }

  try {
    // 1) Filtro sin tokens; si no reconoce el tema, una consulta mínima SI/NO
    if (!pareceDelTema(pregunta) && !(await esDelTema(pregunta))) {
      return successResponse(res, 'Fuera de tema', { ia: true, fueraDeTema: true });
    }

    // 2) Respuesta con la base de conocimiento y, para el alumno, sus propios datos
    const datosPersona = panel === 'alumno' ? await datosDelAlumno(req.user.idUsuario) : null;
    contarUso();
    const crudo = await generar({
      system: instrucciones({ panel, mascota, datosPersona }),
      usuario: `Pregunta de la persona: «${pregunta}»`,
    });

    const r = interpretarRespuesta(crudo, panel);
    if (r.fueraDeTema) return successResponse(res, 'Fuera de tema', { ia: true, fueraDeTema: true });
    if (!r.texto) return successResponse(res, 'Sin respuesta', { ia: false });
    return successResponse(res, 'Respuesta del asistente', { ia: true, texto: r.texto, enlaces: r.enlaces });
  } catch (error) {
    // Cualquier falla de Google o de la base: el chat sigue con las respuestas fijas
    console.error('[Bravo IA]', error.message);
    return successResponse(res, 'Asistente con respuestas fijas', { ia: false });
  }
});
