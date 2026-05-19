const obtenerModulos = `
  SELECT idModulo, nombreModulo, descripcion, creadoEn
  FROM modulo
  ORDER BY nombreModulo
`;

module.exports = obtenerModulos;
