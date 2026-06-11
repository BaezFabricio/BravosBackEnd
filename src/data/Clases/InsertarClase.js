const insertarClase = `
  INSERT INTO clase (
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