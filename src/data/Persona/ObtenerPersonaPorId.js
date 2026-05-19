const obtenerPersonaPorId = `
  SELECT * FROM persona WHERE idpersona = ?
`;

module.exports = obtenerPersonaPorId;