-- Módulo de marcas personales (PR) del alumno.
-- catalogo_ejercicio: ejercicios generales (idAlumno NULL) y propios de cada alumno.
-- marca_personal: una marca (sesión de un ejercicio) con su mejor valor y si fue PR.
-- marca_serie: detalle serie por serie.
-- Nota: la tabla "ejercicio" existente es de rutinas de clase; por eso el nombre distinto.

CREATE TABLE IF NOT EXISTS catalogo_ejercicio (
  idCatalogo INT(11) NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  tipoMarca ENUM('peso','tiempo','repeticiones') NOT NULL,
  idAlumno INT(11) NULL,
  creadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idCatalogo),
  KEY idx_catalogo_alumno (idAlumno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marca_personal (
  idMarca INT(11) NOT NULL AUTO_INCREMENT,
  idAlumno INT(11) NOT NULL,
  idCatalogo INT(11) NOT NULL,
  fecha DATE NOT NULL,
  valorMejor DECIMAL(10,2) NOT NULL,
  esPR TINYINT(1) NOT NULL DEFAULT 0,
  notas VARCHAR(255) NULL,
  creadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idMarca),
  KEY idx_marca_alumno_ejercicio (idAlumno, idCatalogo),
  CONSTRAINT fk_marca_catalogo FOREIGN KEY (idCatalogo) REFERENCES catalogo_ejercicio (idCatalogo) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marca_serie (
  idSerie INT(11) NOT NULL AUTO_INCREMENT,
  idMarca INT(11) NOT NULL,
  numero INT(11) NOT NULL,
  repeticiones INT(11) NULL,
  peso DECIMAL(7,2) NULL,
  tiempoSeg INT(11) NULL,
  PRIMARY KEY (idSerie),
  KEY idx_serie_marca (idMarca),
  CONSTRAINT fk_serie_marca FOREIGN KEY (idMarca) REFERENCES marca_personal (idMarca) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO catalogo_ejercicio (nombre, tipoMarca) VALUES
  ('Sentadilla trasera', 'peso'),
  ('Sentadilla frontal', 'peso'),
  ('Peso muerto', 'peso'),
  ('Press militar', 'peso'),
  ('Press de banca', 'peso'),
  ('Clean', 'peso'),
  ('Snatch', 'peso'),
  ('Thruster', 'peso'),
  ('Dominadas', 'repeticiones'),
  ('Flexiones', 'repeticiones'),
  ('Fran', 'tiempo'),
  ('Murph', 'tiempo'),
  ('Correr 5K', 'tiempo'),
  ('Remo 500 m', 'tiempo');
