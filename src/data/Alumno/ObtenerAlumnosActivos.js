const obtenerAlumnosActivos = `
  SELECT 
    a.idAlumno,
    p.nombrecompleto,
    p.correo,
    a.tipoAlumno,
    a.estado,
    a.fechaAlta
  FROM alumno a
  INNER JOIN persona p ON a.idPersona = p.idpersona
  WHERE a.estado = 'activo'
  ORDER BY a.fechaAlta DESC
`;

module.exports = obtenerAlumnosActivos;