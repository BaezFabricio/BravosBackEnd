const db = require('../config/db');

/*
 * Guías de bienvenida de Bravos (alumno, profesor, administrador): se muestran una sola vez a cada
 * persona. Qué guías ya vio se recuerda en su cuenta (no en el celular), así no se repiten en otro
 * aparato. Solo se guarda "esta persona vio esta guía"; el contenido de la guía vive en la app.
 */

// Únicas guías válidas: lo que manda el navegador nunca se usa tal cual
// 'alumno' es el recorrido completo (se repite desde Mi configuración); 'alumno-bienvenida' es la primera vez que entra
// y cada 'alumno-<módulo>' se muestra la primera vez que se entra a ese módulo.
const GUIAS_VALIDAS = [
  'alumno', 'alumno-bienvenida', 'alumno-resumen', 'alumno-reservar', 'alumno-reservas', 'alumno-marcas',
  'alumno-calculadora', 'alumno-membresia', 'alumno-creditos', 'alumno-documentos', 'alumno-perfil',
  'profesor', 'admin',
];

async function crearTablaGuias() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuario_guia (
      idUsuario INT NOT NULL,
      guia VARCHAR(20) NOT NULL,
      vistaEn DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (idUsuario, guia),
      FOREIGN KEY (idUsuario) REFERENCES usuario(idUsuario) ON DELETE CASCADE
    )
  `);
}

async function guiasVistas(idUsuario) {
  const [filas] = await db.query('SELECT guia FROM usuario_guia WHERE idUsuario = ?', [idUsuario]);
  return filas.map((f) => f.guia);
}

// Devuelve false si la guía no existe
async function marcarVista(idUsuario, guia) {
  if (!GUIAS_VALIDAS.includes(guia)) return false;
  await db.query('INSERT IGNORE INTO usuario_guia (idUsuario, guia) VALUES (?, ?)', [idUsuario, guia]);
  return true;
}

module.exports = { GUIAS_VALIDAS, crearTablaGuias, guiasVistas, marcarVista };
