module.exports = `
  INSERT INTO usuario 
  (idPersona, username, contrasena, idPerfil, estado, correo_verificado, token_verificacion) 
  VALUES (?, ?, ?, ?, ?, 0, ?)
`;