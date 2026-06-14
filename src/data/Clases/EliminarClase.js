const eliminarClase = `
  DELETE FROM diaclase 
  WHERE idClase = ?;
`;

module.exports = eliminarClase;