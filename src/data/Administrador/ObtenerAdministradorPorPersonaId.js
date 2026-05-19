const obtenerAdministradorPorPersonaId = `
  SELECT * FROM administrador WHERE idPersona = ?
`;

module.exports = obtenerAdministradorPorPersonaId;