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
    c.idPlan,
    p2.nombre AS nombrePlan,

    per.nombrecompleto AS nombreProfesor,
    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin,
    MIN(h.turno) AS turno,

    GROUP_CONCAT(h.dia ORDER BY 
      FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')
      SEPARATOR ','
    ) AS diasSemana

  -- 🟢 CORREGIDO: Apunta a tus tablas reales 'diaclase' y los LEFT JOINs seguros
  FROM diaclase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase
  LEFT JOIN plan p2 ON c.idPlan = p2.idPlan

  -- 🟢 FILTRO ESPECÍFICO: Trae solo la clase que seleccionaste
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
    c.idPlan,
    p2.nombre,
    per.nombrecompleto
`;

module.exports = obtenerClasePorId;