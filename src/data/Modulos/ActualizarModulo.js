const actualizarModulo = `
  UPDATE modulo
  SET nombreModulo = ?, descripcion = ?
  WHERE idModulo = ?
`;

module.exports = actualizarModulo;