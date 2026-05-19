const actualizarPerfil = `
  UPDATE perfil
  SET nombrePerfil = ?
  WHERE idPerfil = ?
`;

module.exports = actualizarPerfil;