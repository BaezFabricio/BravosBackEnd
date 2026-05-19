const obtenerUsuarioRegistrado = `
  SELECT 
    u.idUsuario, 
    p.nombrecompleto, 
    p.dni, 
    p.correo, 
    p.telefono, 
    u.username, 
    pf.nombrePerfil as perfil, 
    u.estado
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idpersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  WHERE u.idUsuario = ?
`;

module.exports = obtenerUsuarioRegistrado;