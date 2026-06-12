const eliminarHorariosPorClase = `
  DELETE FROM horarioclase
  WHERE idClase = ?
`;

module.exports = eliminarHorariosPorClase;