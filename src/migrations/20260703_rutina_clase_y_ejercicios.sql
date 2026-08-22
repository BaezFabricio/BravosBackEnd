-- Migration: vincula rutina a una clase (diaclase) y agrega estructura de
-- ejercicios (nombre + video) por rutina. Permite que el admin defina, al crear
-- una clase, la rutina que aplica a todos los alumnos inscriptos, con un video
-- de demostración por ejercicio.

ALTER TABLE rutina
  ADD COLUMN idClase INT(11) DEFAULT NULL,
  ADD COLUMN categoria VARCHAR(50) DEFAULT NULL,
  ADD CONSTRAINT fk_rutina_clase FOREIGN KEY (idClase) REFERENCES diaclase (idClase);

CREATE TABLE ejercicio (
  idEjercicio INT(11) NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  videoUrl VARCHAR(500) DEFAULT NULL,
  orden INT(11) DEFAULT 0,
  idRutina INT(11) NOT NULL,
  PRIMARY KEY (idEjercicio),
  KEY idRutina (idRutina),
  CONSTRAINT fk_ejercicio_rutina FOREIGN KEY (idRutina) REFERENCES rutina (idRutina) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
