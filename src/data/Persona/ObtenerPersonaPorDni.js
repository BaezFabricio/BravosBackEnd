const obtenerPersonaPorDni = `
  SELECT * FROM persona WHERE dni = ?
`;

module.exports = obtenerPersonaPorDni;