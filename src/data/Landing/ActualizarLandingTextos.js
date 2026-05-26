const db = require('../../config/db');

/**
 * Guarda o actualiza los textos de la landing page
 * @param {Object} datos - Objeto con clave y valor { titulo_principal: '...', ... }
 */
const ActualizarLandingTextos = async (datos) => {
  // Recorremos las claves enviadas desde el front
  for (const [clave, valor] of Object.entries(datos)) {
    let seccion = 'nosotros';
    // Considerar cualquier clave que empiece por 'titulo' como parte de la sección hero
    if (clave && typeof clave === 'string' && clave.toLowerCase().startsWith('titulo')) seccion = 'hero';
    if (['direccion', 'telefono', 'email', 'horario_semana', 'horario_sabado', 'horario_domingo'].includes(clave)) seccion = 'contacto';

    await db.query(
      `INSERT INTO landing_textos (seccion, clave, valor) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = ?`,
      [seccion, clave, valor, valor]
    );
  }
  return { success: true };
};

module.exports = ActualizarLandingTextos;