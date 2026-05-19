const actualizarPersona = `
  UPDATE persona 
  SET nombrecompleto = ?, correo = ?, telefono = ?
  WHERE idpersona = ?
`;

module.exports = actualizarPersona;