const obtenerProfesoresActivos = `
  SELECT
    MIN(prof.idProfesor) AS idProfesor,
    per.nombrecompleto AS nombreProfesor,
    MAX(ua.url) AS avatarUrl
  FROM profesor prof
  INNER JOIN persona per ON prof.idPersona = per.idPersona
  LEFT JOIN usuario u ON u.idPersona = per.idPersona
  LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
  GROUP BY per.idPersona, per.nombrecompleto
  ORDER BY per.nombrecompleto ASC;
`;

module.exports = obtenerProfesoresActivos;