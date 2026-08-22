const insertarClase = `
  INSERT INTO diaclase (
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor,
    idPlan
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

module.exports = insertarClase;
