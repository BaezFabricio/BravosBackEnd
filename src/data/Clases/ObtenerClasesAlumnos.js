const obtenerClasesAlumnos = `
  SELECT
    c.idClase,
    c.nombreClase,
    c.tipoClase,
    c.cupoMaximo,
    (
      c.cupoMaximo - (
        SELECT COUNT(*)
        FROM reserva r
        WHERE r.idHorario = h.idHorario
          AND r.estado = 'proxima'
          AND r.fechaReserva >= CURDATE()
      )
    ) AS cupoDisponible,
    c.estado,
    c.idGimnasio,
    c.idProfesor,
    per.nombrecompleto AS nombreProfesor,
    h.idHorario,
    h.dia,
    h.horaInicio,
    h.horaFin,
    h.turno,
    h.fechaEspecifica
  FROM diaclase c
  INNER JOIN horarioclase h ON c.idClase = h.idClase
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  WHERE c.estado = 'Activo'
    AND (h.fechaEspecifica IS NULL OR h.fechaEspecifica >= CURDATE())
    AND (c.fechaPublicacion IS NULL OR c.fechaPublicacion <= NOW())
  ORDER BY h.horaInicio ASC
`;

module.exports = obtenerClasesAlumnos;
