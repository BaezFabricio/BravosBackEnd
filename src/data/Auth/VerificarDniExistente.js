const verificarDniExistente = `SELECT COUNT(*) as count FROM persona WHERE dni = ?`;

module.exports = verificarDniExistente;