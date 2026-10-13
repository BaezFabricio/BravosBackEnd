-- Cuentas creadas por un admin con contraseña temporal: hasta que el usuario la cambie,
-- el servidor solo le permite cambiarla (ver auth.middleware.js).
ALTER TABLE usuario ADD COLUMN debe_cambiar_contrasena TINYINT(1) NOT NULL DEFAULT 0;
