-- Constancia de consentimientos (términos y privacidad, compra, datos de salud) y
-- solicitudes del botón de arrepentimiento (Res. SCI 424/2020). Se crean solas al iniciar el servidor.
CREATE TABLE IF NOT EXISTS consentimiento (
  idConsentimiento INT AUTO_INCREMENT PRIMARY KEY,
  idUsuario INT NULL,
  tipo ENUM('terminos_y_privacidad','compra','datos_salud') NOT NULL,
  version VARCHAR(20) NOT NULL,
  detalle VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_consentimiento_usuario (idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS solicitud_arrepentimiento (
  idSolicitud INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  dni VARCHAR(10) NOT NULL,
  correo VARCHAR(150) NOT NULL,
  telefono VARCHAR(30) NULL,
  fechaCompra DATE NULL,
  detalle VARCHAR(500) NULL,
  estado ENUM('pendiente','resuelta','rechazada') DEFAULT 'pendiente',
  ip VARCHAR(45) NULL,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
