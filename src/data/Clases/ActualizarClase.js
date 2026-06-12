const actualizarClase = `
  UPDATE clase
  SET
    nombreClase = ?,
    tipoClase = ?,
    cupoMaximo = ?,
    cupoDisponible = ?,
    estado = ?,
    idGimnasio = ?,
    idProfesor = ?
  WHERE idClase = ?
`;

module.exports = actualizarClase;