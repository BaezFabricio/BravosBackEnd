const actualizarEstadoClase = `
  UPDATE clase
  SET estado = ?
  WHERE idClase = ?
`;

module.exports = actualizarEstadoClase;