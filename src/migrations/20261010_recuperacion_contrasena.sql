-- Enlaces de recuperación de contraseña de un solo uso. Se guarda solo el hash SHA-256 del token
-- (el token en claro viaja únicamente en el correo). Se crea sola al iniciar el servidor.
CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
  idRecuperacion INT AUTO_INCREMENT PRIMARY KEY,
  idUsuario INT NOT NULL,
  tokenHash CHAR(64) NOT NULL UNIQUE,
  expiraEn DATETIME NOT NULL,
  usadoEn DATETIME NULL,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_recuperacion_usuario (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
