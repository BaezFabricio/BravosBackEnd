const obtenerPersonaPorCorreo = `
  SELECT * FROM persona WHERE correo = ?
`;

module.exports = obtenerPersonaPorCorreo;