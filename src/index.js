require('dotenv').config();

const app = require('./app');
const db = require('./config/db');
const envConfig = require('./config/env');
const Logger = require('./utils/logger');
const crearTablaAvatarUsuario = require('./data/Avatar/CrearTablaAvatarUsuario');

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
  try {
    // Conectar a la BD
    await db.initializePool();
    await db.query(crearTablaAvatarUsuario);

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
