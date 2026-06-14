const obtenerProfesoresActivos = `
  SELECT DISTINCT
    prof.idProfesor, 
    per.nombrecompleto AS nombreProfesor
  FROM profesor prof
  INNER JOIN persona per ON prof.idPersona = per.idPersona
  INNER JOIN usuario u ON per.idPersona = u.idPersona -- 🟢 Conectamos con usuario para sacar el perfil
  INNER JOIN perfilpermiso pp ON u.idPerfil = pp.idPerfil -- 🟢 Ahora sí usamos u.idPerfil
  INNER JOIN permiso perm ON pp.idPermiso = perm.idPermiso
  WHERE perm.modulo = 'profesor'
  ORDER BY per.nombrecompleto ASC;
`;

module.exports = obtenerProfesoresActivos;