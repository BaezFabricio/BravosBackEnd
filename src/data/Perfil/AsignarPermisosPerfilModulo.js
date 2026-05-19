const asignarPermisosPerfilModulo = `
  INSERT INTO perfil_modulo (idPerfil, idModulo, permiso_alta, permiso_baja, permiso_modificacion, permiso_consulta)
  VALUES (?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    permiso_alta = VALUES(permiso_alta),
    permiso_baja = VALUES(permiso_baja),
    permiso_modificacion = VALUES(permiso_modificacion),
    permiso_consulta = VALUES(permiso_consulta)
`;

module.exports = asignarPermisosPerfilModulo;
