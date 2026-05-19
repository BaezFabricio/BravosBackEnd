const eliminarPermisosPerfilModulo = `
  DELETE FROM perfil_modulo WHERE idPerfil = ? AND idModulo = ?
`;

module.exports = eliminarPermisosPerfilModulo;
