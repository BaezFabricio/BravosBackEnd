/**
 * Script de un solo uso: restaura alumno/profesor/diaclase/horarioclase/plan/
 * pago/credito/reserva/usuario_avatar desde bravosdata.sql (estaban vacías en
 * la BD real). Remapea idPersona/idUsuario porque algunas cuentas cambiaron
 * de id entre el dump y la base real (se detectó por username/correo).
 * Hace backup del estado previo antes de tocar nada.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Remapeos detectados: dump -> real (solo Fabricio cambió, el resto coincide)
const REMAP_PERSONA = { 5: 35 };
const REMAP_USUARIO = { 4: 24 };
const remapPersona = (id) => REMAP_PERSONA[id] ?? id;
const remapUsuario = (id) => (id === null || id === undefined) ? id : (REMAP_USUARIO[id] ?? id);

const ALUMNO = [
  [1, '2026-06-14', 'activo', 6],
  [2, '2026-06-14', 'activo', 5],
  [3, '2026-06-15', 'activo', 8],
];
// tipoAlumno venía vacío ('') en el dump para el alumno 1; se normaliza a 'amateur'
const ALUMNO_TIPO = { 1: 'amateur', 2: 'amateur', 3: 'amateur' };

const PROFESOR = [
  [1, 'Crossfit Coach', 5],
  [2, 'Crossfit / General', 10],
  [3, 'Crossfit / General', 5],
  [4, 'Crossfit / General', 28],
  [5, 'Crossfit / General', 8],
  [6, 'Crossfit / General', 8],
];

const DIACLASE = [
  [4, 'Clase Crossfit', 'Grupal', 15, 5, 'Activo', null, 2],
  [7, 'Funcional', 'Grupal', 10, 2, 'Activo', null, 1],
];

const HORARIOCLASE = [
  [1, 'LUNES', '15:32:00', '16:45:00', 'Siesta', 4],
  [22, 'LUNES', '15:23:00', '17:00:00', 'Siesta', 7],
  [23, 'MARTES', '15:23:00', '17:00:00', 'Siesta', 7],
  [24, 'MIERCOLES', '15:23:00', '17:00:00', 'Siesta', 7],
  [25, 'JUEVES', '15:23:00', '17:00:00', 'Siesta', 7],
  [26, 'VIERNES', '15:23:00', '17:00:00', 'Siesta', 7],
  [27, 'SABADO', '15:23:00', '17:00:00', 'Siesta', 7],
];

const PLAN = [
  [1, 'PLANIFICACIÓN ATLETA', 'Plan de entrenamiento avanzado', 36000.00, 30, 'PlanificacionAtleta'],
  [2, 'CLASE CROSSFIT', 'Plan de entrenamiento avanzado', 36000.00, 20, 'ClaseCross'],
];

const PAGO = [
  [1, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-06-10', 2, 2, null],
  [2, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-06-10', 2, 2, null],
  [3, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-10', 2, 2, null],
  [4, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-10', 2, 2, null],
  [5, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-14', 2, 2, null],
  [6, '2026-06-14', 43000.00, 'Efectivo', 'confirmado', '2026-07-14', 2, 1, null],
  [7, '2026-06-14', 43000.00, 'Efectivo', 'confirmado', '2026-07-14', 2, 1, null],
  [8, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-14', 2, 2, 5],
  [9, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-14', 2, 2, 5],
  [10, '2026-06-14', 36000.00, 'Efectivo', 'confirmado', '2026-07-14', 1, 2, 5],
  [11, '2026-06-15', 36000.00, 'Efectivo', 'confirmado', '2026-07-15', 3, 2, 5],
  [12, '2026-06-16', 36000.00, 'Efectivo', 'confirmado', '2026-07-16', 3, 2, 7],
  [13, '2026-06-16', 36000.00, 'Efectivo', 'confirmado', '2026-07-16', 2, 2, 5],
];

const CREDITO = [
  [1, 20, 0, 0, '2026-06-14', '2026-07-14', 'CANCELADO', 2, 4],
  [2, 20, 0, 0, '2026-06-14', '2026-07-14', 'CANCELADO', 2, 5],
  [3, 30, 0, 0, '2026-06-14', '2026-07-14', 'CANCELADO', 2, 6],
  [4, 30, 0, 0, '2026-06-14', '2026-07-14', 'CANCELADO', 2, 7],
  [5, 20, 0, 0, '2026-06-14', '2026-07-14', 'CANCELADO', 2, 8],
  [6, 20, 20, 0, '2026-06-14', '2026-07-14', 'ACTIVO', 2, 9],
  [7, 20, 12, 8, '2026-06-14', '2026-07-14', 'ACTIVO', 1, 10],
  [8, 20, 0, 1, '2026-06-15', '2026-07-15', 'CANCELADO', 3, 11],
  [9, 20, 3, 17, '2026-06-16', '2026-07-16', 'ACTIVO', 3, 12],
  [10, 20, 20, 0, '2026-06-16', '2026-07-16', 'ACTIVO', 2, 13],
];

const RESERVA = [
  [1,'2026-06-08','02:32:37','cancelada',1,22,null],[2,'2026-06-08','02:37:22','cancelada',1,1,null],
  [3,'2026-06-08','02:48:33','cancelada',1,22,null],[4,'2026-06-08','02:49:20','cancelada',1,22,null],
  [5,'2026-06-09','02:51:29','cancelada',1,23,null],[6,'2026-06-08','03:16:18','cancelada',1,22,null],
  [7,'2026-06-16','00:47:30','cancelada',1,23,null],[8,'2026-06-15','00:48:26','cancelada',1,22,null],
  [9,'2026-06-15','00:54:27','cancelada',1,22,null],[10,'2026-06-15','01:00:19','cancelada',1,22,7],
  [11,'2026-06-15','01:09:56','cancelada',1,22,7],[12,'2026-06-15','01:14:40','cancelada',1,1,7],
  [13,'2026-06-16','01:18:30','cancelada',1,23,7],[14,'2026-06-15','01:51:48','proxima',3,22,8],
  [15,'2026-06-17','15:52:28','cancelada',1,24,7],[16,'2026-06-16','02:01:04','proxima',3,23,9],
  [17,'2026-06-17','02:01:08','proxima',3,24,9],[18,'2026-06-18','02:01:10','proxima',3,25,9],
  [19,'2026-06-19','02:01:12','proxima',3,26,9],[20,'2026-06-20','02:01:15','proxima',3,27,9],
  [21,'2026-06-22','02:01:22','proxima',3,22,9],[22,'2026-06-22','02:01:26','proxima',3,1,9],
  [23,'2026-06-23','02:01:28','proxima',3,23,9],[24,'2026-06-29','02:01:49','proxima',3,1,9],
  [25,'2026-07-06','02:02:10','proxima',3,1,9],[26,'2026-07-13','02:02:15','proxima',3,1,9],
  [27,'2026-07-20','02:02:19','proxima',3,1,9],[28,'2026-07-27','02:02:25','proxima',3,1,9],
  [29,'2026-08-03','02:02:32','proxima',3,1,9],[30,'2026-08-10','02:02:35','proxima',3,1,9],
  [31,'2026-08-17','02:02:39','proxima',3,1,9],[32,'2026-08-24','02:02:42','proxima',3,1,9],
  [33,'2026-08-31','02:02:44','cancelada',3,1,9],[34,'2026-09-07','02:02:48','cancelada',3,1,9],
  [35,'2026-09-14','02:02:50','cancelada',3,1,9],[36,'2026-06-16','14:23:37','cancelada',1,23,7],
  [37,'2026-06-16','14:24:23','cancelada',1,23,7],[38,'2026-06-16','14:31:28','cancelada',1,23,7],
  [39,'2026-06-16','14:31:45','cancelada',1,23,7],[40,'2026-06-16','14:49:01','cancelada',1,23,7],
  [41,'2026-06-17','15:01:57','cancelada',1,24,7],
];

const USUARIO_AVATAR_FALTANTE = [4, 'https://res.cloudinary.com/dlxibypyj/image/upload/v1781407794/bravos_avatars/neisqdti9xbuzowth9yr.jpg'];

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', user: 'root', password: '', database: 'bravosdata', port: 3306,
  });

  try {
    const tablas = ['alumno','profesor','diaclase','horarioclase','plan','pago','credito','reserva','usuario_avatar'];
    const backup = { fecha: new Date().toISOString(), motivo: 'Backup previo a restaurar datos operativos desde bravosdata.sql' };
    for (const t of tablas) {
      const [rows] = await conn.query('SELECT * FROM ' + t);
      backup[t] = rows;
    }
    const backupPath = path.join(__dirname, '..', 'backups', `datos_operativos_backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log('✓ Backup guardado en', backupPath);

    await conn.beginTransaction();

    for (const [id, fechaAlta, estado, idPersona] of ALUMNO) {
      await conn.query(
        'INSERT INTO alumno (idAlumno, fechaAlta, tipoAlumno, estado, idPersona) VALUES (?, ?, ?, ?, ?)',
        [id, fechaAlta, ALUMNO_TIPO[id], estado, remapPersona(idPersona)]
      );
    }
    console.log(`✓ ${ALUMNO.length} alumnos restaurados`);

    for (const [id, especialidad, idPersona] of PROFESOR) {
      await conn.query(
        'INSERT INTO profesor (idProfesor, especialidad, idPersona) VALUES (?, ?, ?)',
        [id, especialidad, remapPersona(idPersona)]
      );
    }
    console.log(`✓ ${PROFESOR.length} profesores restaurados`);

    for (const [id, nombre, tipo, cupoMax, cupoDisp, estado, idGimnasio, idProfesor] of DIACLASE) {
      await conn.query(
        'INSERT INTO diaclase (idClase, nombreClase, tipoClase, cupoMaximo, cupoDisponible, estado, idGimnasio, idProfesor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, nombre, tipo, cupoMax, cupoDisp, estado, idGimnasio, idProfesor]
      );
    }
    console.log(`✓ ${DIACLASE.length} clases restauradas`);

    for (const [id, dia, horaInicio, horaFin, turno, idClase] of HORARIOCLASE) {
      await conn.query(
        'INSERT INTO horarioclase (idHorario, dia, horaInicio, horaFin, turno, idClase) VALUES (?, ?, ?, ?, ?, ?)',
        [id, dia, horaInicio, horaFin, turno, idClase]
      );
    }
    console.log(`✓ ${HORARIOCLASE.length} horarios restaurados`);

    for (const [id, nombre, desc, precio, creditos, tipo] of PLAN) {
      await conn.query(
        'INSERT INTO plan (idPlan, nombre, descripcion, precio, cantidadCreditos, tipo) VALUES (?, ?, ?, ?, ?, ?)',
        [id, nombre, desc, precio, creditos, tipo]
      );
    }
    console.log(`✓ ${PLAN.length} planes restaurados`);

    for (const [id, fechaPago, importe, formaPago, estadoPago, fechaVenc, idAlumno, idPlan, idUsuarioOp] of PAGO) {
      await conn.query(
        'INSERT INTO pago (idPago, fechaPago, importe, formaPago, estadoPago, fechaVencimiento, idAlumno, idPlan, idUsuarioOperador) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, fechaPago, importe, formaPago, estadoPago, fechaVenc, idAlumno, idPlan, remapUsuario(idUsuarioOp)]
      );
    }
    console.log(`✓ ${PAGO.length} pagos restaurados`);

    for (const [id, total, disp, usados, fechaIni, fechaVenc, estado, idAlumno, idPago] of CREDITO) {
      await conn.query(
        'INSERT INTO credito (idCredito, totalCreditos, creditosCisponibles, creditosUtilizados, fechaInicio, fechaVencimiento, estado, idAlumno, idPago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, total, disp, usados, fechaIni, fechaVenc, estado, idAlumno, idPago]
      );
    }
    console.log(`✓ ${CREDITO.length} créditos restaurados`);

    for (const [id, fecha, hora, estado, idAlumno, idHorario, idCredito] of RESERVA) {
      await conn.query(
        'INSERT INTO reserva (idReserva, fechaReserva, horaReserva, estado, idAlumno, idHorario, idCredito) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, fecha, hora, estado, idAlumno, idHorario, idCredito]
      );
    }
    console.log(`✓ ${RESERVA.length} reservas restauradas`);

    const [idUsuarioAvatar, url] = USUARIO_AVATAR_FALTANTE;
    await conn.query(
      'INSERT INTO usuario_avatar (idUsuario, url) VALUES (?, ?)',
      [remapUsuario(idUsuarioAvatar), url]
    );
    console.log('✓ 1 avatar faltante restaurado (Fabricio)');

    await conn.commit();
    console.log('\n✅ Transacción confirmada.');

    for (const t of tablas) {
      const [rows] = await conn.query('SELECT COUNT(*) AS c FROM ' + t);
      console.log(t + ':', rows[0].c, 'filas');
    }

  } catch (error) {
    await conn.rollback();
    console.error('✗ ERROR, se hizo rollback de todo:', error.message);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(() => process.exit(1));
