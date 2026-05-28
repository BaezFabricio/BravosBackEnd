const obtenerUsuarioPorId = `
  SELECT 
    u.idUsuario, 
    p.nombrecompleto, 
    p.correo, 
    p.telefono, 
    p.dni,
    u.username, 
    pf.nombrePerfil, 
    u.estado, 
    u.idPerfil, 
    p.idpersona,
    ua.url AS avatarUrl
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idpersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  LEFT JOIN usuario_avatar ua ON ua.idUsuario = u.idUsuario
  WHERE u.idUsuario = ?
`;

module.exports = obtenerUsuarioPorId;