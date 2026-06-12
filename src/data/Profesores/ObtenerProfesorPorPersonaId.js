const obtenerProfesorPorPersonaId = `
  SELECT * FROM profesor WHERE idPersona = ?
`;

module.exports = obtenerProfesorPorPersonaId;