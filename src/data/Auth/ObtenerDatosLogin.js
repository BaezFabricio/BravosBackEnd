// Contenido de ObtenerDatosLogin.js
const obtenerDatosLogin = `
  SELECT 
    u.idUsuario, 
    u.username, 
    u.contrasena,    
    u.estado, 
    u.correo_verificado, 
    u.idPerfil,
    per.nombrePerfil, 
    p.nombrecompleto,
    p.correo
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idPersona
  LEFT JOIN perfil per ON u.idPerfil = per.idPerfil
  WHERE p.correo = ?;
`;

module.exports = obtenerDatosLogin;