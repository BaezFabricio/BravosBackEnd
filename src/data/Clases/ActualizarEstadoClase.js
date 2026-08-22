const actualizarEstadoClase = `
  UPDATE diaclase
  SET estado = ?
  WHERE idClase = ?
`;

module.exports = actualizarEstadoClase;