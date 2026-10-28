const insertarClase = `
  INSERT INTO diaclase (
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor,
    tipoPlan,
    fechaPublicacion
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

module.exports = insertarClase;
