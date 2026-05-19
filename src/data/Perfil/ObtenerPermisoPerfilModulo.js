const obtenerPermisoPerfilModulo = `
  SELECT 
    pm.idPerfil,
    pm.idModulo,
    m.nombreModulo,
    pm.permiso_alta,
    pm.permiso_baja,
    pm.permiso_modificacion,
    pm.permiso_consulta
  FROM perfil_modulo pm
  INNER JOIN modulo m ON pm.idModulo = m.idModulo
  WHERE pm.idPerfil = ? AND m.nombreModulo = ?
  LIMIT 1
`;

module.exports = obtenerPermisoPerfilModulo;