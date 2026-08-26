-- Agrega la columna 'titulo' a la tabla notificacion si no existe.
-- La tabla fue creada originalmente sin esta columna; el CREATE TABLE IF NOT EXISTS
-- no la agrega retroactivamente, por eso hay que hacer el ALTER manualmente.

ALTER TABLE notificacion
  ADD COLUMN titulo VARCHAR(150) NOT NULL DEFAULT '' AFTER tipo;
