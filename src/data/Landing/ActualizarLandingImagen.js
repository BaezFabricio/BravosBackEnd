const db = require('../../config/db');

const ActualizarLandingImagen = async ({ tipo, url }) => {
  try {
    const sql = `
      INSERT INTO landing_imagenes (tipo, url, updated_at) 
      VALUES (?, ?, NOW()) 
      ON DUPLICATE KEY UPDATE url = ?, updated_at = NOW()
    `;
    // Al ser 'tipo' un campo UNIQUE, si ya existe, se actualiza la URL. Si no, se inserta.
    const [resultado] = await db.query(sql, [tipo, url, url]);
    return resultado;
  } catch (error) {
    console.error(`Error SQL en ActualizarLandingImagen para ${tipo}:`, error);
    throw error;
  }
};

module.exports = ActualizarLandingImagen;