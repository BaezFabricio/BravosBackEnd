const obtenerProfesores = `
  SELECT 
    pr.idProfesor,
    p.nombrecompleto,
    p.correo,
    pr.especialidad
  FROM profesor pr
  INNER JOIN persona p ON pr.idPersona = p.idpersona
  ORDER BY p.nombrecompleto
`;

module.exports = obtenerProfesores;