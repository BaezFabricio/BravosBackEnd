const sql = `
  SELECT DISTINCT 
    a.idAlumno AS id, 
    p.nombrecompleto, 
    r.estado AS asistencia
FROM reserva r
INNER JOIN alumno a ON r.idAlumno = a.idAlumno
INNER JOIN persona p ON a.idPersona = p.idPersona
INNER JOIN horarioclase h ON r.idHorario = h.idHorario
INNER JOIN diaclase c ON h.idClase = c.idClase
WHERE c.idClase = ?              -- Filtra por la clase específica (la del Select)
  AND r.fechaReserva = ?         -- Filtra por la fecha seleccionada
  AND c.idProfesor = ?;
`;
module.exports = sql;