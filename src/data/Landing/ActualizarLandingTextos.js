const db = require('../../config/db');

/**
 * Guarda o actualiza los textos de la landing page
 * @param {Object} datos - Objeto con clave y valor { titulo_principal: '...', ... }
 */
const ActualizarLandingTextos = async (datos) => {
  // Recorremos las claves enviadas desde el front
  for (const [clave, valor] of Object.entries(datos)) {
    let seccion = 'nosotros';
    if (['titulo_principal'].includes(clave)) seccion = 'hero';
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