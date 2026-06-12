const eliminarClase = `
  DELETE FROM clase
  WHERE idClase = ?
`;

module.exports = eliminarClase;