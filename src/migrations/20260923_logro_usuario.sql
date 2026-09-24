-- Logros ya desbloqueados por cada usuario (para animar y notificar solo la primera vez).
CREATE TABLE IF NOT EXISTS logro_usuario (
  idUsuario INT(11) NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  creadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idUsuario, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
