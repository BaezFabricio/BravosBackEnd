const cors = require('cors');
const envConfig = require('./env');

const isAllowedDevOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (origin === envConfig.cors.origin) {
    return true;
  }

  const devOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/;

  return devOriginPattern.test(origin);
};

/**
 * Configuración CORS personalizada
 */
const corsOptions = {
  // Ahora permitimos una lista de puertos para que no se bloquee con el frontend (5173)
  origin: [envConfig.cors.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
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