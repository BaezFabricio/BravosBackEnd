const insertarHorarioClase = `
  INSERT INTO horarioclase (
    dia,
    horaInicio,
    horaFin,
    turno,
    idClase,
    fechaEspecifica
  )
  VALUES (?, ?, ?, ?, ?, ?)
`;

module.exports = insertarHorarioClase;
