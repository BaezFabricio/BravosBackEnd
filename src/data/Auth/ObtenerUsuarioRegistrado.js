const obtenerUsuarioRegistrado = `
  SELECT 
    u.idUsuario,
    u.username,
    pf.nombrePerfil as perfil,
    u.estado,
    ua.url AS avatarUrl,
    p.*,
    p.fecha_registro AS fechaRegistro
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idPersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
  WHERE u.idUsuario = ?
`;

module.exports = obtenerUsuarioRegistrado;