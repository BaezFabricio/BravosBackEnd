const db = require('../config/db');

/*
 * Regla contra la escalada de privilegios: nadie le puede dar a otro (ni a sí mismo) más poder
 * del que tiene. Aplica al crear o editar perfiles y al asignarle un perfil a un usuario.
 * El perfil 1 (administrador general) tiene pase libre en requirePermission, así que solo él
 * puede asignarlo o modificarlo.
 */
const ID_PERFIL_SUPERADMIN = 1;
const esSuperAdmin = (idPerfil) => Number(idPerfil) === ID_PERFIL_SUPERADMIN;

// Módulos de gestión: los que dan poder sobre los datos de otros (usuarios, pagos, clases, perfiles…).
// Los de los paneles de alumno y profesor quedan fuera de esta regla: el perfil Admin no los tiene
// todos y, si contaran, no podría darle el perfil de alumno o de profesor a nadie.
const MODULOS_DE_GESTION = ["dashboard", "usuarios", "clases", "reservas", "creditos", "membresias", "perfiles", "configuracion"];
const esDeGestion = (k) => MODULOS_DE_GESTION.includes(k.split(":")[0]);

const clave = (modulo, accion) => `${String(modulo).trim().toLowerCase()}:${String(accion).trim().toLowerCase()}`;

/** Permisos de un perfil como conjunto de "modulo:accion". */
async function permisosDePerfil(idPerfil) {
  const [rows] = await db.query(
    `SELECT p.modulo, p.accion
       FROM perfilpermiso pp
       INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
      WHERE pp.idPerfil = ?`,
    [idPerfil]
  );
  return new Set(rows.map((r) => clave(r.modulo, r.accion)));
}

/** De la lista pedida ("modulo:accion"), los permisos de gestión que quien hace el pedido no tiene. */
async function permisosQueNoTiene(idPerfilQuien, lista) {
  if (esSuperAdmin(idPerfilQuien)) return [];
  const propios = await permisosDePerfil(idPerfilQuien);
  return lista.filter((p) => esDeGestion(p) && !propios.has(p));
}

/** ¿Puede asignarle a alguien el perfil "idPerfilDestino"? Solo si no supera al suyo. */
async function puedeAsignarPerfil(idPerfilQuien, idPerfilDestino) {
  if (esSuperAdmin(idPerfilQuien)) return true;
  if (esSuperAdmin(idPerfilDestino)) return false;
  const destino = await permisosDePerfil(idPerfilDestino);
  return (await permisosQueNoTiene(idPerfilQuien, [...destino])).length === 0;
}

module.exports = { MODULOS_DE_GESTION, ID_PERFIL_SUPERADMIN, esSuperAdmin, clave, permisosDePerfil, permisosQueNoTiene, puedeAsignarPerfil };
