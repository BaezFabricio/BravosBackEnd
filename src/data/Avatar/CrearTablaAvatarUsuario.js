const crearTablaAvatarUsuario = `
  CREATE TABLE IF NOT EXISTS usuario_avatar (
    idUsuario INT NOT NULL PRIMARY KEY,
    url VARCHAR(500) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuario_avatar_usuario
      FOREIGN KEY (idUsuario) REFERENCES usuario(idUsuario)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

module.exports = crearTablaAvatarUsuario;