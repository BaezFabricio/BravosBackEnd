const obtenerClasesAlumnos = `
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
    h.idHorario,      -- 🟢 Fundamental para que el alumno reserve el turno correcto
    h.dia,            -- 🟢 Devuelve el día limpio por separado (ej: 'LUNES')
    h.horaInicio,     -- 🟢 Su hora exacta
    h.horaFin,
    h.turno
  FROM diaclase c
  INNER JOIN horarioclase h ON c.idClase = h.idClase
  LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
  LEFT JOIN persona per ON p.idPersona = per.idPersona
  WHERE c.estado = 'Activo'
  ORDER BY h.horaInicio ASC
`;

module.exports = obtenerClasesAlumnos;