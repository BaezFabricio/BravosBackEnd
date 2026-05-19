const insertarPersona = `
  INSERT INTO persona (nombrecompleto, dni, correo, telefono)
  VALUES (?, ?, ?, ?)
`;

module.exports = insertarPersona;