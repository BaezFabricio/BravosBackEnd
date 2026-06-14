const actualizarClase = `
  UPDATE diaclase 
  SET 
    nombreClase = ?,
    tipoClase = ?,
    cupoMaximo = ?,
    cupoDisponible = ?,
    estado = ?,
    idGimnasio = ?, -- Acá el controlador va a mandar NULL automáticamente
    idProfesor = ?
  WHERE idClase = ?;
`;

module.exports = actualizarClase;