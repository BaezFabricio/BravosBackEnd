require('dotenv').config();

// Hora de Argentina para todo el proceso, aunque el servidor esté configurado en UTC (fechas de pago, vencimientos, avisos)
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';

const app = require('./app');
const db = require('./config/db');
const envConfig = require('./config/env');
const Logger = require('./utils/logger');
const { releaseOccupiedPort } = require('./utils/releaseOccupiedPort');
const crearTablaAvatarUsuario = require('./data/Avatar/CrearTablaAvatarUsuario');
const { crearTablaNotificacion } = require('./functions/notificacion.service');
const { crearTablasLegales } = require('./functions/consentimiento');
const { crearTablaRecuperacion } = require('./functions/recuperacion');
const { crearTablaPush } = require('./functions/push.service');
const { crearTablaGuias } = require('./functions/guias.service');
const { crearTablaTurnosHorarios } = require('./functions/turnosHorarios');
const { crearTablaTiposClase } = require('./functions/tiposClase');
const { prepararCreditosSemanales, iniciarCronCreditosSemanales } = require('./functions/creditosSemanales');
const { prepararDescuentoDiario, iniciarCronDescuentoDiario } = require('./functions/descuentoDiario');
const { iniciarCronPublicacion } = require('./functions/publicacionCron');
const { iniciarCronMembresias } = require('./functions/membresiasCron');

const logger = new Logger('Server');

const ASCII_ART = `
 ██████╗ ██████╗  █████╗ ██╗   ██╗ ██████╗ ███████╗
 ██╔══██╗██╔══██╗██╔══██╗██║   ██║██╔═══██╗██╔════╝
 ██████╔╝██████╔╝███████║██║   ██║██║   ██║███████╗
 ██╔══██╗██╔══██╗██╔══██║╚██╗ ██╔╝██║   ██║╚════██║
 ██████╔╝██║  ██║██║  ██║ ╚████╔╝ ╚██████╔╝███████║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝   ╚═════╝ ╚══════╝
                                           BACKEND
`;

/**
 * Prepara la base (tablas y migraciones) e inicia las tareas automáticas (avisos de clases, descuento diario de
 * créditos, créditos semanales y membresías). Las tareas se inician al final, una sola vez.
 */
async function inicializarBase() {
  await db.query(crearTablaAvatarUsuario);
  await crearTablaNotificacion();
  await crearTablaPush(); // dispositivos con notificaciones push activadas
  await crearTablaGuias(); // qué guías de bienvenida vio cada persona
  await prepararCreditosSemanales(); // créditos por semana de los planes y descuento de lo no usado
  await prepararDescuentoDiario(); // tabla de días cobrados y columna de cobro en las reservas
  await crearTablaTiposClase(); // tipos de clase del box (CrossFit, Planificación Atleta…): unen planes, clases y reservas
  await crearTablaTurnosHorarios(); // horarios de los turnos del box (lista para elegir al crear una clase)
  await crearTablasLegales();
  await crearTablaRecuperacion();
  // Migraciones independientes — fallan silenciosamente si la columna ya existe
  // Tabla de documentos de alumnos
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS documento_alumno (
        idDocumento INT AUTO_INCREMENT PRIMARY KEY,
        idPersona INT NOT NULL,
        tipo ENUM('comprobante_transferencia','certificado_medico','declaracion_jurada') NOT NULL,
        nombreArchivo VARCHAR(255) NOT NULL,
        urlArchivo VARCHAR(500) NOT NULL,
        estado ENUM('pendiente','aprobado') DEFAULT 'pendiente',
        creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (idPersona) REFERENCES persona(idPersona) ON DELETE CASCADE
      )
    `);
  } catch {}

  const migraciones = [
    `ALTER TABLE reserva ADD COLUMN creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE diaclase ADD COLUMN fechaPublicacion DATETIME NULL`,
    `ALTER TABLE diaclase ADD COLUMN emailEnviado TINYINT DEFAULT 0`,
    `ALTER TABLE documento_alumno ADD COLUMN estado ENUM('pendiente','aprobado') DEFAULT 'pendiente'`,
    `ALTER TABLE usuario ADD COLUMN activadoManualEn DATETIME NULL`,
    `ALTER TABLE pago ADD COLUMN referenciaExterna VARCHAR(100) NULL`,
    `ALTER TABLE pago MODIFY COLUMN idUsuarioOperador INT NULL`,
    // El registro crea las cuentas como 'pendiente' (sin perfil hasta que el admin asigne uno);
    // la base no tenía ese valor y, en modo estricto, el registro fallaba.
    `ALTER TABLE usuario MODIFY COLUMN estado ENUM('activo','inactivo','suspendido','pendiente') DEFAULT 'activo'`,
    // Versión de sesión: al cambiar la contraseña sube y se cierran las sesiones abiertas
    `ALTER TABLE usuario ADD COLUMN sesion_version INT NOT NULL DEFAULT 0`,
    // Contraseña temporal (alta hecha por un admin): hay que cambiarla al primer ingreso
    `ALTER TABLE usuario ADD COLUMN debe_cambiar_contrasena TINYINT(1) NOT NULL DEFAULT 0`,
    // Descripción del plan: primera línea = descripción corta; las demás = condiciones que ve el alumno
    `ALTER TABLE plan MODIFY COLUMN descripcion VARCHAR(1000) NULL`,
  ];
  for (const sql of migraciones) {
    try { await db.query(sql); } catch { /* columna ya existe */ }
  }

  iniciarCronPublicacion();
  iniciarCronMembresias();
  iniciarCronCreditosSemanales(); // descuenta los créditos que sobraron en cada semana terminada
  iniciarCronDescuentoDiario(); // cobra el día de apertura a los planes sin cupo semanal
}

// Si MySQL no estaba listo al arrancar (por ejemplo, tras reiniciar el servidor), se reintenta hasta que lo esté.
// Antes el servidor quedaba sin ninguna tarea automática hasta el siguiente reinicio manual.
let reintentoBase = null;
function reintentarBase() {
  if (reintentoBase) return;
  reintentoBase = setInterval(async () => {
    try {
      await inicializarBase();
      clearInterval(reintentoBase);
      reintentoBase = null;
      console.log('[Server] MySQL disponible: base preparada y tareas automáticas iniciadas.');
    } catch (err) {
      console.error('[Server] MySQL todavía no disponible, se reintenta en 15 s:', err.message);
    }
  }, 15000);
}

/**
 * Inicia el servidor
 */
async function startServer() {
  const requireDbOnStartup = envConfig.nodeEnv === 'production';

  try {
    await releaseOccupiedPort(envConfig.port, logger);

    // En desarrollo permitimos iniciar sin DB para facilitar pruebas de rutas no dependientes.
    try {
      await db.initializePool();
      await inicializarBase();
    } catch (dbError) {
      if (requireDbOnStartup) {
        throw dbError;
      }
      logger.warn(`MySQL no disponible al iniciar (${dbError.code || dbError.message}). El servidor arrancara en modo degradado.`);
      reintentarBase(); // sin esto, si MySQL tardaba en arrancar, las tareas automáticas nunca se iniciaban
    }

    // Iniciar servidor HTTP
    const server = app.listen(envConfig.port, () => {
      console.clear();
      console.log(ASCII_ART);
      console.log('\n✓ BRAVOS BACKEND INICIADO EXITOSAMENTE\n');
      console.log(`  Puerto: ${envConfig.port}`);
      console.log(`  Entorno: ${envConfig.nodeEnv}`);
      console.log(`  Base de datos: ${envConfig.db.database}`);
      console.log(`  URL API: http://localhost:${envConfig.port}${envConfig.api.prefix}/v${envConfig.api.version}`);
      console.log(`  Health check: http://localhost:${envConfig.port}/health\n`);
      if (!requireDbOnStartup) {
        console.log('  Nota: en desarrollo, la API inicia aunque MySQL no este disponible.');
      }
    });

    // Manejo de señales para cierre graceful
    process.on('SIGINT', async () => {
      console.log('\n\n✓ Cerrando servidor...');
      server.close(async () => {
        await db.closePool();
        process.exit(0);
      });
    });

    process.on('SIGTERM', async () => {
      console.log('\n\n✓ Cerrando servidor...');
      server.close(async () => {
        await db.closePool();
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Iniciar
startServer();

module.exports = startServer;
