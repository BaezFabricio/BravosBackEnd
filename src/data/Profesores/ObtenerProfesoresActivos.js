const obtenerProfesoresActivos = `
  SELECT
    MIN(prof.idProfesor) AS idProfesor,
    per.nombrecompleto AS nombreProfesor
  FROM profesor prof
  INNER JOIN persona per ON prof.idPersona = per.idPersona
  GROUP BY per.idPersona, per.nombrecompleto
  ORDER BY per.nombrecompleto ASC;
`;

module.exports = obtenerProfesoresActivos;