const eliminarUsuario = `
  DELETE FROM usuario WHERE idUsuario = ?
`;

module.exports = eliminarUsuario;