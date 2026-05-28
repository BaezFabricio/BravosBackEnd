const obtenerAvatarUsuario = `
  SELECT idUsuario, url
  FROM usuario_avatar
  WHERE idUsuario = ?
`;

module.exports = obtenerAvatarUsuario;