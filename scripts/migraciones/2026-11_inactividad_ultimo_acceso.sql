-- Regla de inactividad: guarda la fecha del último inicio de sesión de cada cuenta.
-- Aplicar una sola vez en cada base (desarrollo y servidor).
ALTER TABLE usuario ADD COLUMN ultimoAcceso DATETIME NULL DEFAULT NULL;
