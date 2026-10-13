-- La descripción del plan guarda la descripción corta (primera línea) y las condiciones
-- que ve el alumno (una por línea): 255 caracteres no alcanzaban.
ALTER TABLE plan MODIFY COLUMN descripcion VARCHAR(1000) NULL;
