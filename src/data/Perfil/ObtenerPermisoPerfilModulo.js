const obtenerPermisoPerfilModulo = `
  SELECT p.idPermiso
  FROM perfilpermiso pp
  INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
  WHERE pp.idPerfil = ? 
    AND LOWER(p.modulo) = LOWER(?) 
    AND LOWER(p.accion) = LOWER(?)
  LIMIT 1
`;

module.exports = obtenerPermisoPerfilModulo;