const obtenerClases = `
  SELECT 
    c.idClase,
    c.nombreClase,
    c.tipoClase,
    c.cupoMaximo,
    c.cupoDisponible,
    c.estado,
    c.idGimnasio,
    c.idProfesor,
    c.tipoPlan,
    tc.nombre AS nombreTipo,

    per.nombrecompleto AS nombreProfesor,
    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin,
    MIN(h.turno) AS turno,

    GROUP_CONCAT(h.dia ORDER BY
      FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')
      SEPARATOR ','
    ) AS diasSemana,
    MIN(h.fechaEspecifica) AS fechaEspecifica,

    (
      SELECT COUNT(*)
      FROM reserva r
      INNER JOIN horarioclase hx ON hx.idHorario = r.idHorario
      WHERE hx.idClase = c.idClase
        AND r.estado = 'proxima'
        AND r.fechaReserva = (
          SELECT MIN(t.fechaSiguiente)
          FROM (
            SELECT
              CASE
                WHEN hy.fechaEspecifica IS NOT NULL AND DATE(hy.fechaEspecifica) >= CURDATE() THEN DATE(hy.fechaEspecifica)
                WHEN hy.fechaEspecifica IS NOT NULL THEN NULL -- clase única ya pasada: no tiene próxima fecha
                ELSE DATE_ADD(
                  CURDATE(),
                  INTERVAL MOD(
                    FIELD(hy.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO') - 1 - WEEKDAY(CURDATE()) + 14,
                    7
                  ) DAY
                )
              END AS fechaSiguiente
            FROM horarioclase hy
            WHERE hy.idClase = c.idClase
          ) t
        )
    ) AS anotados,

    (
      SELECT COUNT(*)
      FROM asistencia asi
      INNER JOIN reserva rs ON rs.idReserva = asi.idReserva
      INNER JOIN horarioclase hs ON hs.idHorario = rs.idHorario
      WHERE hs.idClase = c.idClase AND asi.estado = 'presente'
    ) AS asistieron

  FROM diaclase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase
  LEFT JOIN tipo_clase tc ON tc.codigo = c.tipoPlan

  GROUP BY 
    c.idClase, 
    c.nombreClase, 
    c.tipoClase, 
    c.cupoMaximo, 
    c.cupoDisponible, 
    c.estado, 
    c.idGimnasio,
    c.tipoPlan,
    tc.nombre,
    c.idProfesor,
    per.nombrecompleto

  ORDER BY c.idClase DESC
`;

module.exports = obtenerClases;