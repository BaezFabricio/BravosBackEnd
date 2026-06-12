const cors = require('cors');
const envConfig = require('./env');

/**
 * Configuración CORS personalizada
 */
const corsOptions = {
  origin: [
    envConfig.cors.origin,

    // Frontend local
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',

    // Frontend por IP de red
    'http://192.168.56.1:5174',
    'http://192.168.1.5:5174',
  ],
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