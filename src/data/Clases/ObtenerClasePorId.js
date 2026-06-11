const obtenerClasePorId = `
  SELECT 
    idClase,
    nombreClase,
    tipoClase,
    cupoMaximo,
    cupoDisponible,
    estado,
    idGimnasio,
    idProfesor
  FROM clase
  WHERE idClase = ?
`;

module.exports = obtenerClasePorId;