require('dotenv').config();

const app = require('./app');
const db = require('./config/db');
const envConfig = require('./config/env');
const Logger = require('./utils/logger');
const { releaseOccupiedPort } = require('./utils/releaseOccupiedPort');
const crearTablaAvatarUsuario = require('./data/Avatar/CrearTablaAvatarUsuario');
const { crearTablaNotificacion } = require('./functions/notificacion.service');
const { iniciarCronPublicacion } = require('./functions/publicacionCron');

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
      const migraciones = [
        `ALTER TABLE reserva ADD COLUMN creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE diaclase ADD COLUMN fechaPublicacion DATETIME NULL`,
        `ALTER TABLE diaclase ADD COLUMN emailEnviado TINYINT DEFAULT 0`,
      ];
      for (const sql of migraciones) {
        try { await db.query(sql); } catch { /* columna ya existe */ }
      }

      iniciarCronPublicacion();
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
