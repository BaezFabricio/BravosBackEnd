// Clases que ve un alumno al reservar: solo las de los planes que tiene contratados y vigentes
// (crédito activo y sin vencer). Una clase de otro plan no le aparece. El parámetro es el idUsuario del token.
const obtenerClasesParaAlumno = `
  SELECT
    c.idClase,
    c.nombreClase,
    c.tipoClase,
    c.idPlan,
    pl.nombre AS nombrePlan,
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
  LEFT JOIN plan pl ON pl.idPlan = c.idPlan
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  WHERE c.estado = 'Activo'
    AND (h.fechaEspecifica IS NULL OR h.fechaEspecifica >= CURDATE())
    AND (c.fechaPublicacion IS NULL OR c.fechaPublicacion <= NOW())
    AND c.idPlan IN (
      SELECT pa.idPlan
      FROM credito cr
      INNER JOIN alumno a ON a.idAlumno = cr.idAlumno
      INNER JOIN usuario u ON u.idPersona = a.idPersona
      INNER JOIN pago pa ON pa.idPago = cr.idPago
      WHERE u.idUsuario = ?
        AND cr.estado = 'ACTIVO'
        AND cr.fechaVencimiento >= CURDATE()
    )
  ORDER BY h.horaInicio ASC
`;

module.exports = obtenerClasesParaAlumno;
