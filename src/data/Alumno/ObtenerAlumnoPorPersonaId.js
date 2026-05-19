const obtenerAlumnoPorPersonaId = `
  SELECT * FROM alumno WHERE idPersona = ?
`;

module.exports = obtenerAlumnoPorPersonaId;