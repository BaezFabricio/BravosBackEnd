const obtenerDatosLogin = `
  SELECT 
    u.idUsuario, 
    u.username, 
    u.contrasena, 
    u.idPerfil,
    p.nombrecompleto, 
    p.correo, 
    pf.nombrePerfil, 
    u.estado
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idpersona
  LEFT JOIN perfil pf ON u.idPerfil = pf.idPerfil
  WHERE p.correo = ? AND u.estado = 'activo'
`;

module.exports = obtenerDatosLogin;