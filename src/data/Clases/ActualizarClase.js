// emailEnviado se vuelve a 0 solo si cambió la fecha del aviso. Antes se reiniciaba en cada
// edición y, si el aviso ya había salido, el email se mandaba de nuevo a todos los alumnos.
// Va primero porque MySQL asigna de izquierda a derecha: así compara contra la fecha vieja.
const actualizarClase = `
  UPDATE diaclase
  SET
    emailEnviado = IF(fechaPublicacion <=> ?, emailEnviado, 0),
    nombreClase = ?,
    tipoClase = ?,
    cupoMaximo = ?,
    cupoDisponible = ?,
    estado = ?,
    idGimnasio = ?,
    idProfesor = ?,
    idPlan = ?,
    fechaPublicacion = ?
  WHERE idClase = ?;
`;

module.exports = actualizarClase;
