const insertarProfesor = `
  INSERT INTO profesor (idPersona, especialidad)
  VALUES (?, ?)
`;

module.exports = insertarProfesor;