const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');
const { crearNotificacion } = require('../functions/notificacion.service');

// Catálogo de logros válidos (el frontend calcula cuáles se cumplen; acá solo se registran)
const LOGROS = {
  primera_clase: 'Primera Clase',
  racha_5: 'Racha 5 días',
  primer_pr: 'Primer PR',
  superandote: 'Superándote',
  todoterreno: 'Todoterreno',
  club_100: 'Club de los 100',
};

/**
 * POST /logros/sincronizar   body: { codigos: [...] }
 * Registra los logros nuevos, genera la notificación y devuelve solo los recién desbloqueados.
 */
exports.sincronizar = asyncHandler(async (req, res) => {
  const idUsuario = req.user.idUsuario;
  const codigos = [...new Set(Array.isArray(req.body.codigos) ? req.body.codigos : [])].filter((c) => LOGROS[c]);

  const nuevos = [];
  for (const codigo of codigos) {
    const [ins] = await db.query('INSERT IGNORE INTO logro_usuario (idUsuario, codigo) VALUES (?, ?)', [idUsuario, codigo]);
    if (ins.affectedRows === 1) nuevos.push(codigo);
  }

  for (const codigo of nuevos) {
    crearNotificacion(
      idUsuario,
      'sistema',
      `🏆 ¡Logro desbloqueado: ${LOGROS[codigo]}!`,
      `Conseguiste el logro "${LOGROS[codigo]}". ¡Seguí así!`,
      '/alumno'
    );
  }

  return successResponse(res, 'Logros sincronizados', { nuevos });
});
