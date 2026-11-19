const db = require('../config/db');

/*
 * Regla contra la escalada de privilegios: nadie le puede dar a otro (ni a sí mismo) más poder
 * del que tiene. Aplica al crear o editar perfiles y al asignarle perfiles a un usuario.
 * El perfil 1 (administrador general) tiene pase libre en requirePermission, así que solo él
 * puede asignarlo o modificarlo.
 *
 * Un usuario puede tener varios perfiles: su poder es la unión de los permisos de todos.
 * Las funciones aceptan un número (un perfil) o una lista de perfiles.
 */
const ID_PERFIL_SUPERADMIN = 1;

const aLista = (x) => (Array.isArray(x) ? x : [x])
  .map(Number)
  .filter((n) => Number.isInteger(n) && n > 0);

const esSuperAdmin = (perfiles) => aLista(perfiles).includes(ID_PERFIL_SUPERADMIN);

// Módulos de gestión: los que dan poder sobre los datos de otros (usuarios, pagos, clases, perfiles…).
// Los de los paneles de alumno y profesor quedan fuera de esta regla: el perfil Admin no los tiene
// todos y, si contaran, no podría darle el perfil de alumno o de profesor a nadie.
const MODULOS_DE_GESTION = ["dashboard", "usuarios", "clases", "reservas", "creditos", "membresias", "perfiles", "configuracion"];
const esDeGestion = (k) => MODULOS_DE_GESTION.includes(k.split(":")[0]);

const clave = (modulo, accion) => `${String(modulo).trim().toLowerCase()}:${String(accion).trim().toLowerCase()}`;

/** Permisos de uno o varios perfiles (la unión) como conjunto de "modulo:accion". */
async function permisosDePerfil(perfiles) {
  const ids = aLista(perfiles);
  if (ids.length === 0) return new Set();
  const [rows] = await db.query(
    `SELECT p.modulo, p.accion
       FROM perfilpermiso pp
       INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
      WHERE pp.idPerfil IN (?)`,
    [ids]
  );
  return new Set(rows.map((r) => clave(r.modulo, r.accion)));
}

/** De la lista pedida ("modulo:accion"), los permisos de gestión que quien hace el pedido no tiene. */
async function permisosQueNoTiene(perfilesQuien, lista) {
  if (esSuperAdmin(perfilesQuien)) return [];
  const propios = await permisosDePerfil(perfilesQuien);
  return lista.filter((p) => esDeGestion(p) && !propios.has(p));
}

/** ¿Puede asignarle a alguien los perfiles "perfilesDestino"? Solo si no supera a los suyos. */
async function puedeAsignarPerfil(perfilesQuien, perfilesDestino) {
  if (esSuperAdmin(perfilesQuien)) return true;
  if (esSuperAdmin(perfilesDestino)) return false;
  const destino = await permisosDePerfil(perfilesDestino);
  return (await permisosQueNoTiene(perfilesQuien, [...destino])).length === 0;
}

module.exports = { MODULOS_DE_GESTION, ID_PERFIL_SUPERADMIN, esSuperAdmin, aLista, clave, permisosDePerfil, permisosQueNoTiene, puedeAsignarPerfil };
