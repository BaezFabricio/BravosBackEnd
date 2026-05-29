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
  origin: (origin, callback) => {
    if (isAllowedDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
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
