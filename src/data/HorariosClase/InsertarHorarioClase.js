const insertarHorarioClase = `
  INSERT INTO horarioclase (
    dia,
    horaInicio,
    horaFin,
    turno,
    idClase
  )
  VALUES (?, ?, ?, ?, ?)
`;

module.exports = insertarHorarioClase;