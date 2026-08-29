const insertarClase = `
  INSERT INTO diaclase (
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor,
    idPlan,
    fechaPublicacion
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

module.exports = insertarClase;
