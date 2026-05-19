const obtenerModuloPorId = `
  SELECT idModulo, nombreModulo, descripcion, creadoEn
  FROM modulo
  WHERE idModulo = ?
`;

module.exports = obtenerModuloPorId;