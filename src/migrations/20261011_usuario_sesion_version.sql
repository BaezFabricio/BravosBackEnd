-- Versión de sesión por usuario: al cambiar o recuperar la contraseña sube en 1
-- y los tokens emitidos antes (que llevan la versión vieja) dejan de valer.
ALTER TABLE usuario ADD COLUMN sesion_version INT NOT NULL DEFAULT 0;
