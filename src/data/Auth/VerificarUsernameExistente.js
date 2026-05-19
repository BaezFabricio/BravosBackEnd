const verificarUsernameExistente = `SELECT COUNT(*) as count FROM usuario WHERE username = ?`;

module.exports = verificarUsernameExistente;