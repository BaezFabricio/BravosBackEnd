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
    p.idpersona
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idpersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  WHERE u.idUsuario = ?
`;

module.exports = obtenerUsuarioPorId;