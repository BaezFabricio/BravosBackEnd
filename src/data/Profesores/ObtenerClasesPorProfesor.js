const sql = `
  SELECT 
    c.idClase,
    c.nombreClase,
    per.nombrecompleto AS nombreProfesor,
    GROUP_CONCAT(h.dia ORDER BY FIELD(h.dia, 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO') SEPARATOR ', ') AS dias,
    MIN(h.horaInicio) AS horaInicio,
    MIN(h.horaFin) AS horaFin
  FROM diaclase c
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  LEFT JOIN horarioclase h ON c.idClase = h.idClase
  WHERE c.idProfesor = ?
  GROUP BY c.idClase, c.nombreClase, per.nombrecompleto
`;

module.exports = sql;