const cors = require('cors');
const envConfig = require('./env');

/**
 * Configuración CORS personalizada
 */
const corsOptions = {
  origin: envConfig.cors.origin,
  credentials: envConfig.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 horas
};

/**
 * Middleware CORS
 */
const corsMiddleware = cors(corsOptions);

module.exports = {
  corsOptions,
  corsMiddleware,
};
