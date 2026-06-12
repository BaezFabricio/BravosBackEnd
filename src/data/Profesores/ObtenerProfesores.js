const obtenerProfesores = `
  SELECT 
    p.idProfesor,
    per.nombrecompleto,
    p.especialidad
  FROM profesor p
  INNER JOIN persona per ON p.idPersona = per.idpersona
  WHERE per.nombrecompleto <> 'Profesor Prueba'
  ORDER BY per.nombrecompleto ASC
`;

module.exports = obtenerProfesores;