const insertarAlumno = `
  INSERT INTO alumno (idPersona, fechaAlta, tipoAlumno, estado)
  VALUES (?, CURDATE(), ?, ?)
`;

module.exports = insertarAlumno;