const actualizarClase = `
  UPDATE diaclase
  SET
    nombreClase = ?,
    tipoClase = ?,
    cupoMaximo = ?,
    cupoDisponible = ?,
    estado = ?,
    idGimnasio = ?,
    idProfesor = ?,
    idPlan = ?
  WHERE idClase = ?;
`;

module.exports = actualizarClase;
