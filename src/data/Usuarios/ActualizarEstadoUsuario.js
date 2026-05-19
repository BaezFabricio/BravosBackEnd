const actualizarEstadoUsuario = `
  UPDATE usuario SET estado = ? WHERE idUsuario = ?
`;

module.exports = actualizarEstadoUsuario;