const verificarCorreoExistente = `SELECT COUNT(*) as count FROM persona WHERE correo = ?`;

module.exports = verificarCorreoExistente;