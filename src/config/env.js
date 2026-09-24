const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

// Con el secreto por defecto (escrito en el código) cualquiera podría fabricar un token válido de
// cualquier usuario, incluido un administrador. Por eso en producción el servidor no arranca con él.
const SECRETO_POR_DEFECTO = 'your_secret_key_change_this_in_production';
const secretoJwt = process.env.JWT_SECRET || SECRETO_POR_DEFECTO;
if (process.env.NODE_ENV === 'production' && (secretoJwt === SECRETO_POR_DEFECTO || secretoJwt.length < 32)) {
  throw new Error('JWT_SECRET debe estar definido en el .env con un valor aleatorio de al menos 32 caracteres');
}
if (secretoJwt === SECRETO_POR_DEFECTO) {
  console.warn('[SEGURIDAD] JWT_SECRET usa el valor por defecto: definí uno propio en el .env');
}

const envConfig = {
  // Base de datos
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'bravosdata',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },

  // JWT
  jwt: {
    secret: secretoJwt,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  // Servidor
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  backendUrl: (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),

  // API
  api: {
    prefix: '/api',
    version: 'v1',
  },

  // Logs
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // ✨ CONFIGURACIÓN SMTP PARA CORREOS REALES
  smtp: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
};


// El secreto con el que se firman las sesiones. Si fuera conocido (por ejemplo, este valor por defecto,
// que está escrito en el código), cualquiera podría fabricar un token válido de cualquier usuario,
// incluido un administrador, y saltearse todos los permisos.
module.exports = envConfig;