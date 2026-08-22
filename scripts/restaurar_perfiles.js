/**
 * Script de un solo uso: restaura permiso/perfil/perfilpermiso desde el dump
 * bravosdata.sql (la BD real quedó con estas tablas vacías), reasigna idPerfil
 * a cada usuario real por username, y elimina los perfiles de prueba huérfanos
 * (sin ningún usuario asignado). Hace backup del estado previo antes de tocar nada.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const PERMISOS = [
  [1,'dashboard','alta'],[2,'dashboard','baja'],[3,'dashboard','consulta'],[4,'dashboard','modificacion'],
  [5,'usuarios','alta'],[6,'usuarios','baja'],[7,'usuarios','consulta'],[8,'usuarios','modificacion'],
  [9,'clases','alta'],[10,'clases','baja'],[11,'clases','consulta'],[12,'clases','modificacion'],
  [13,'reservas','alta'],[14,'reservas','baja'],[15,'reservas','consulta'],[16,'reservas','modificacion'],
  [17,'creditos','alta'],[18,'creditos','baja'],[19,'creditos','consulta'],[20,'creditos','modificacion'],
  [21,'membresias','alta'],[22,'membresias','baja'],[23,'membresias','consulta'],[24,'membresias','modificacion'],
  [25,'perfiles','alta'],[26,'perfiles','baja'],[27,'perfiles','consulta'],[28,'perfiles','modificacion'],
  [29,'configuracion','alta'],[30,'configuracion','baja'],[31,'configuracion','consulta'],[32,'configuracion','modificacion'],
  [33,'alumno','alta'],[34,'alumno','baja'],[35,'alumno','consulta'],[36,'alumno','modificacion'],
  [37,'alumno_reservas','consulta'],[38,'alumno_reservas','alta'],[39,'alumno_reservas','baja'],
  [40,'alumno_creditos','consulta'],[41,'alumno_reservas','modificacion'],[42,'alumno_creditos','alta'],
  [43,'alumno_creditos','baja'],[44,'alumno_creditos','modificacion'],
  [45,'profesor','alta'],[46,'profesor','baja'],[47,'profesor','consulta'],[48,'profesor','modificacion'],
  [49,'profesor_rutinas','alta'],[50,'profesor_rutinas','baja'],[51,'profesor_rutinas','consulta'],[52,'profesor_rutinas','modificacion'],
  [53,'profesor_perfil','alta'],[54,'profesor_perfil','baja'],[55,'profesor_perfil','consulta'],[56,'profesor_perfil','modificacion'],
];

const PERFILES = [
  [7, 'admin 2', 'Acceso completo al modulo de administrador'],
  [8, 'Usuario Alumno y Usuarios', 'Solo puede consultar usuarios'],
  [9, 'Alumno', 'Acceso Completo al Modulo de Alumno'],
  [10, 'perfil prueba', 'prueba'],
  [11, 'Prueba', 'prueba'],
];

const PERFIL_7 = Array.from({ length: 56 }, (_, i) => i + 1);
const PERFIL_8 = [7,31,33,34,35,36,37,38,39,40,41,42,43,44];
const PERFIL_9 = [11,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56];
const PERFIL_10 = [7,33,34,35,36,37,38,39,40,41,42,43,44];
const PERFIL_11 = [6];

const PERFILPERMISO = [
  ...PERFIL_7.map(p => [7, p]),
  ...PERFIL_8.map(p => [8, p]),
  ...PERFIL_9.map(p => [9, p]),
  ...PERFIL_10.map(p => [10, p]),
  ...PERFIL_11.map(p => [11, p]),
];

// Mapeo username (login real) -> idPerfil del dump
const ASIGNACION_USUARIO = {
  'bravosbox1@gmail.com': 7,           // admin 2
  'fabriciobaezz11@gmail.com': 7,      // admin 2
  'videospolitica78@gmail.com': 9,     // Alumno
  'angelajuanavillalba.14@gmail.com': 9, // Alumno
  'lujansofia13@gmail.com': 10,        // perfil prueba
  // 'cacaman1126@gmail.com' -> sin equivalente en el dump, se deja sin asignar (queda como estaba: NULL)
};

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', user: 'root', password: '', database: 'bravosdata', port: 3306,
  });

  try {
    // 1. BACKUP del estado actual (antes de tocar nada)
    const [permisoActual] = await conn.query('SELECT * FROM permiso');
    const [perfilActual] = await conn.query('SELECT * FROM perfil');
    const [perfilpermisoActual] = await conn.query('SELECT * FROM perfilpermiso');
    const [usuarioActual] = await conn.query('SELECT idUsuario, username, idPerfil FROM usuario');

    const backup = {
      fecha: new Date().toISOString(),
      motivo: 'Backup previo a restaurar permiso/perfil/perfilpermiso desde bravosdata.sql (tablas vacías en la BD real)',
      permiso: permisoActual,
      perfil: perfilActual,
      perfilpermiso: perfilpermisoActual,
      usuario_idPerfil: usuarioActual,
    };

    const backupPath = path.join(__dirname, '..', 'backups', `perfiles_backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log('✓ Backup guardado en', backupPath);

    await conn.beginTransaction();

    // 2. Restaurar permiso
    for (const [id, modulo, accion] of PERMISOS) {
      await conn.query('INSERT INTO permiso (idPermiso, modulo, accion) VALUES (?, ?, ?)', [id, modulo, accion]);
    }
    console.log(`✓ ${PERMISOS.length} permisos restaurados`);

    // 3. Restaurar perfil (ids 7-11; el id 1 "admin" real no se toca)
    for (const [id, nombre, desc] of PERFILES) {
      await conn.query('INSERT INTO perfil (idPerfil, nombrePerfil, descripcion) VALUES (?, ?, ?)', [id, nombre, desc]);
    }
    console.log(`✓ ${PERFILES.length} perfiles restaurados`);

    // 4. Restaurar perfilpermiso
    for (const [idPerfil, idPermiso] of PERFILPERMISO) {
      await conn.query('INSERT INTO perfilpermiso (idPerfil, idPermiso) VALUES (?, ?)', [idPerfil, idPermiso]);
    }
    console.log(`✓ ${PERFILPERMISO.length} asignaciones perfil-permiso restauradas`);

    // 5. Reasignar idPerfil a cada usuario real por username
    for (const [username, idPerfil] of Object.entries(ASIGNACION_USUARIO)) {
      const [result] = await conn.query('UPDATE usuario SET idPerfil = ? WHERE username = ?', [idPerfil, username]);
      console.log(`✓ ${username} -> idPerfil ${idPerfil} (filas afectadas: ${result.affectedRows})`);
    }

    // 6. Limpieza: eliminar perfiles de prueba/huérfanos (sin ningún usuario asignado)
    const [usuariosPostAsignacion] = await conn.query('SELECT DISTINCT idPerfil FROM usuario WHERE idPerfil IS NOT NULL');
    const perfilesEnUso = new Set(usuariosPostAsignacion.map(r => r.idPerfil));
    const perfilesHuerfanos = PERFILES.map(p => p[0]).filter(id => !perfilesEnUso.has(id));

    for (const idPerfil of perfilesHuerfanos) {
      await conn.query('DELETE FROM perfilpermiso WHERE idPerfil = ?', [idPerfil]);
      await conn.query('DELETE FROM perfil WHERE idPerfil = ?', [idPerfil]);
      console.log(`✓ Perfil huérfano eliminado: idPerfil ${idPerfil}`);
    }

    await conn.commit();
    console.log('\n✅ Transacción confirmada.');

    // 7. Resumen final
    const [perfilesFinal] = await conn.query('SELECT * FROM perfil ORDER BY idPerfil');
    const [usuariosFinal] = await conn.query('SELECT idUsuario, username, idPerfil FROM usuario ORDER BY idUsuario');
    console.log('\n--- PERFILES FINALES ---');
    console.table(perfilesFinal);
    console.log('\n--- USUARIOS FINALES ---');
    console.table(usuariosFinal);

  } catch (error) {
    await conn.rollback();
    console.error('✗ ERROR, se hizo rollback de todo:', error.message);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(() => process.exit(1));
