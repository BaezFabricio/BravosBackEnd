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
    
    per.nombrecompleto AS nombreProfesor,
    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin,
    MIN(h.turno) AS turno,

    GROUP_CONCAT(h.dia ORDER BY 
      FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')
      SEPARATOR ','
    ) AS diasSemana

  FROM diaclase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase

  GROUP BY 
    c.idClase, 
    c.nombreClase, 
    c.tipoClase, 
    c.cupoMaximo, 
    c.cupoDisponible, 
    c.estado, 
    c.idGimnasio, 
    c.idProfesor, 
    per.nombrecompleto

  ORDER BY c.idClase DESC
`;

module.exports = obtenerClases;