-- Migration: Añade la columna fecha_registro a la tabla persona
-- Ejecutar en la base de datos MySQL del proyecto

ALTER TABLE persona
  ADD COLUMN IF NOT EXISTS fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Nota: Si tu versión de MySQL no soporta IF NOT EXISTS en ALTER TABLE,
-- ejecuta primero un chequeo o usa: ALTER TABLE persona ADD COLUMN fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
