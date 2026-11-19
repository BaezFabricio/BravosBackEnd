-- Varios perfiles por usuario (ej.: Alumno + Profesor).
-- usuario.idPerfil queda como perfil principal (el que se muestra por defecto); usuario_perfil guarda todos.
-- Aplicar una sola vez. Copia el perfil actual de cada usuario, así nadie pierde permisos.

CREATE TABLE IF NOT EXISTS usuario_perfil (
  idUsuario INT NOT NULL,
  idPerfil  INT NOT NULL,
  PRIMARY KEY (idUsuario, idPerfil),
  KEY idx_usuario_perfil_perfil (idPerfil),
  CONSTRAINT fk_usuario_perfil_usuario FOREIGN KEY (idUsuario) REFERENCES usuario (idUsuario) ON DELETE CASCADE,
  CONSTRAINT fk_usuario_perfil_perfil  FOREIGN KEY (idPerfil)  REFERENCES perfil (idPerfil)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO usuario_perfil (idUsuario, idPerfil)
SELECT idUsuario, idPerfil FROM usuario WHERE idPerfil IS NOT NULL;
