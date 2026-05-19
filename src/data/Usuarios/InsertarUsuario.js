const insertarUsuario = `
  INSERT INTO usuario (idPersona, username, contrasena, idPerfil, estado)
  VALUES (?, ?, ?, ?, ?)
`;

module.exports = insertarUsuario;