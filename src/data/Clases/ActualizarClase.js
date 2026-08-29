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
    idPlan = ?,
    fechaPublicacion = ?,
    emailEnviado = 0
  WHERE idClase = ?;
`;

module.exports = actualizarClase;
