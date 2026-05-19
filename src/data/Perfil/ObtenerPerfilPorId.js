const obtenerPerfilPorId = `
  SELECT * FROM perfil WHERE idPerfil = ?
`;

module.exports = obtenerPerfilPorId;