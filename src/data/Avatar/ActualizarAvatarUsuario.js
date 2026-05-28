const actualizarAvatarUsuario = `
  INSERT INTO usuario_avatar (idUsuario, url, updated_at)
  VALUES (?, ?, NOW())
  ON DUPLICATE KEY UPDATE url = VALUES(url), updated_at = NOW()
`;

module.exports = actualizarAvatarUsuario;