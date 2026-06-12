const obtenerClasePorId = `
  SELECT 
    c.idClase,
    c.nombreClase,
    c.tipoClase,
    c.cupoMaximo,
    c.cupoDisponible,
    c.estado,
    c.idGimnasio,
    c.idProfesor,

    p.especialidad,
    per.nombrecompleto AS nombreProfesor,

    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin,
    MIN(h.turno) AS turno,

    GROUP_CONCAT(h.dia ORDER BY 
      FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')
      SEPARATOR ','
    ) AS diasSemana

  FROM clase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idpersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase

  WHERE c.idClase = ?

  GROUP BY 
    c.idClase,
    c.nombreClase,
    c.tipoClase,
    c.cupoMaximo,
    c.cupoDisponible,
    c.estado,
    c.idGimnasio,
    c.idProfesor,
    p.especialidad,
    per.nombrecompleto
`;

module.exports = obtenerClasePorId;