const sql = `
 SELECT DISTINCT 
    a.idAlumno AS id, 
    p.nombrecompleto, 
    p.dni,
    r.estado AS asistencia
FROM reserva r
INNER JOIN alumno a ON r.idAlumno = a.idAlumno
INNER JOIN persona p ON a.idPersona = p.idPersona
INNER JOIN horarioclase h ON r.idHorario = h.idHorario
INNER JOIN diaclase c ON h.idClase = c.idClase
WHERE c.idClase = ? 
  AND r.fechaReserva = ? 
  AND c.idProfesor = ?
  AND r.estado = 'proxima';
`;
module.exports = sql;