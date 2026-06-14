const insertarClase = `
  INSERT INTO diaclase (
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

module.exports = insertarClase;