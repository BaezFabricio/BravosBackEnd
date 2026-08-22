-- Migration: Añade idUsuarioOperador a pago (columna que el código ya usa
-- en usuarios.controller.js pero faltaba en la BD real)
ALTER TABLE pago
  ADD COLUMN idUsuarioOperador INT(11) DEFAULT NULL,
  ADD CONSTRAINT fk_pago_usuario_operador FOREIGN KEY (idUsuarioOperador) REFERENCES usuario (idUsuario);
