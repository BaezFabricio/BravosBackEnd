// Contenido de ObtenerDatosLogin.js
const obtenerDatosLogin = `
  SELECT 
    u.idUsuario, 
    u.username, 
    u.contrasena,    
    u.estado, 
    u.correo_verificado, 
    u.idPerfil,
    p.nombrecompleto,
    p.correo
  FROM usuario u
  INNER JOIN persona p ON u.idPersona = p.idPersona
  WHERE p.correo = ?;
`;

module.exports = obtenerDatosLogin;