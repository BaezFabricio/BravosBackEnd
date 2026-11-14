-- Ficha completa del alumno (pantalla 05): fecha de nacimiento y contacto de emergencia en la persona,
-- y notas internas del administrador sobre el alumno (tabla nueva).
ALTER TABLE persona
  ADD COLUMN fechaNacimiento DATE NULL,
  ADD COLUMN contactoEmergencia VARCHAR(100) NULL,
  ADD COLUMN telefonoEmergencia VARCHAR(30) NULL;

CREATE TABLE IF NOT EXISTS alumno_nota (
  idNota INT(11) NOT NULL AUTO_INCREMENT,
  idAlumno INT(11) NOT NULL,
  texto VARCHAR(1000) NOT NULL,
  idUsuarioAutor INT(11) NULL,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idNota),
  KEY idx_nota_alumno (idAlumno),
  CONSTRAINT fk_nota_alumno FOREIGN KEY (idAlumno) REFERENCES alumno (idAlumno) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
