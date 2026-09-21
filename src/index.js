require('dotenv').config();

const app = require('./app');
const db = require('./config/db');
const envConfig = require('./config/env');
const Logger = require('./utils/logger');
const { releaseOccupiedPort } = require('./utils/releaseOccupiedPort');
const crearTablaAvatarUsuario = require('./data/Avatar/CrearTablaAvatarUsuario');
const { crearTablaNotificacion } = require('./functions/notificacion.service');
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
 * Inicia el servidor
 */
async function startServer() {
  const requireDbOnStartup = envConfig.nodeEnv === 'production';

  try {
    await releaseOccupiedPort(envConfig.port, logger);

    // En desarrollo permitimos iniciar sin DB para facilitar pruebas de rutas no dependientes.
    try {
      await db.initializePool();
      await db.query(crearTablaAvatarUsuario);
      await crearTablaNotificacion();
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

      // Tabla de variantes de ejercicios
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS variante (
            idVariante INT AUTO_INCREMENT PRIMARY KEY,
            idEjercicio INT NOT NULL,
            nombre VARCHAR(255) NOT NULL,
            descripcion TEXT,
            videoUrl VARCHAR(500),
            limitacion VARCHAR(255),
            FOREIGN KEY (idEjercicio) REFERENCES ejercicio(idEjercicio) ON DELETE CASCADE
          )
        `);
      } catch {}

      const migraciones = [
        `ALTER TABLE reserva ADD COLUMN creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE diaclase ADD COLUMN fechaPublicacion DATETIME NULL`,
        `ALTER TABLE diaclase ADD COLUMN emailEnviado TINYINT DEFAULT 0`,
        `ALTER TABLE documento_alumno ADD COLUMN estado ENUM('pendiente','aprobado') DEFAULT 'pendiente'`,
        `ALTER TABLE usuario ADD COLUMN activadoManualEn DATETIME NULL`,
      ];
      for (const sql of migraciones) {
        try { await db.query(sql); } catch { /* columna ya existe */ }
      }

      iniciarCronPublicacion();
      iniciarCronMembresias();
    } catch (dbError) {
      if (requireDbOnStartup) {
        throw dbError;
      }
      logger.warn(`MySQL no disponible al iniciar (${dbError.code || dbError.message}). El servidor arrancara en modo degradado.`);
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
