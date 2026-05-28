const obtenerUsuarioRegistrado = `
  SELECT 
    u.idUsuario, 
    p.nombrecompleto, 
    p.dni, 
    p.correo, 
    p.telefono, 
    u.username, 
    pf.nombrePerfil as perfil, 
    u.estado,
    ua.url AS avatarUrl
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idpersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
  WHERE u.idUsuario = ?
`;

module.exports = obtenerUsuarioRegistrado;