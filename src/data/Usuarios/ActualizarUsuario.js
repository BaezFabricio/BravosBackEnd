const actualizarUsuario = `
  UPDATE usuario 
  SET username = ?, idPerfil = ?
  WHERE idUsuario = ?
`;

module.exports = actualizarUsuario;