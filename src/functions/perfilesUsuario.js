const db = require('../config/db');

/*
 * Un usuario puede tener varios perfiles a la vez (ej.: Alumno + Profesor). Los permisos que cuentan son la
 * unión de todos. Fuente: tabla usuario_perfil, más usuario.idPerfil (el principal) por si quedó algún caso viejo.
 */

/** IDs de los perfiles de un usuario (sin repetir). */
async function perfilesDeUsuario(idUsuario) {
  if (!idUsuario) return [];
  try {
    const [rows] = await db.query(
      `SELECT idPerfil FROM usuario_perfil WHERE idUsuario = ?
       UNION
       SELECT idPerfil FROM usuario WHERE idUsuario = ? AND idPerfil IS NOT NULL`,
      [idUsuario, idUsuario]
    );
    return rows.map((r) => Number(r.idPerfil));
  } catch (error) {
    // Si todavía no se aplicó la migración (tabla usuario_perfil), se sigue con el perfil principal para no tirar el sistema
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    console.error('[perfiles] Falta la tabla usuario_perfil: aplicá scripts/migraciones/2026-11_usuario_perfil.sql');
    const principal = await perfilPrincipalDeUsuario(idUsuario);
    return principal ? [principal] : [];
  }
}

/** Perfiles de un usuario con su nombre (para mostrarlos): [{ idPerfil, nombrePerfil }]. */
async function perfilesDetalle(idUsuario) {
  if (!idUsuario) return [];
  const ids = await perfilesDeUsuario(idUsuario); // con el respaldo de arriba si falta la tabla
  if (ids.length === 0) return [];
  const [rows] = await db.query('SELECT idPerfil, nombrePerfil FROM perfil WHERE idPerfil IN (?) ORDER BY idPerfil', [ids]);
  return rows.map((r) => ({ idPerfil: Number(r.idPerfil), nombrePerfil: r.nombrePerfil }));
}

/** Perfil principal (el que se muestra por defecto): usuario.idPerfil. */
async function perfilPrincipalDeUsuario(idUsuario) {
  const [rows] = await db.query('SELECT idPerfil FROM usuario WHERE idUsuario = ?', [idUsuario]);
  return rows[0]?.idPerfil ? Number(rows[0].idPerfil) : null;
}

module.exports = { perfilesDeUsuario, perfilesDetalle, perfilPrincipalDeUsuario };
