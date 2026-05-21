require('dotenv').config();

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
    secret: process.env.JWT_SECRET || 'your_secret_key_change_this_in_production',
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

module.exports = envConfig;