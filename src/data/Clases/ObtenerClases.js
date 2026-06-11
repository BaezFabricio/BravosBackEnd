const obtenerClases = `
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
  ORDER BY idClase DESC
`;

module.exports = obtenerClases;