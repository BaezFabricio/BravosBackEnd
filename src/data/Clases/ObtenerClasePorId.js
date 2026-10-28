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
    c.tipoPlan,
    tc.nombre AS nombreTipo,
    DATE_FORMAT(c.fechaPublicacion, '%Y-%m-%dT%H:%i:%s') AS fechaPublicacion,

    per.nombrecompleto AS nombreProfesor,
    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin,
    MIN(h.turno) AS turno,

    GROUP_CONCAT(h.dia ORDER BY 
      FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')
      SEPARATOR ','
    ) AS diasSemana,
    -- Las sesiones únicas tienen un solo horario con fecha; las recurrentes, NULL
    DATE_FORMAT(MAX(h.fechaEspecifica), '%Y-%m-%d') AS fechaEspecifica

  -- 🟢 CORREGIDO: Apunta a tus tablas reales 'diaclase' y los LEFT JOINs seguros
  FROM diaclase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase
  LEFT JOIN tipo_clase tc ON tc.codigo = c.tipoPlan

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
    c.tipoPlan,
    c.fechaPublicacion,
    tc.nombre,
    per.nombrecompleto
`;

module.exports = obtenerClasePorId;