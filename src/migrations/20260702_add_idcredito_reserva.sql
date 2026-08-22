-- Migration: Añade idCredito a reserva (columna que reservas.controller.js
-- ya usa para descontar/devolver créditos, pero faltaba en la BD real)
ALTER TABLE reserva
  ADD COLUMN idCredito INT(11) DEFAULT NULL;
