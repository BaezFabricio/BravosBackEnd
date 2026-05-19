const express = require('express');
const envConfig = require('./config/env');
const { corsMiddleware } = require('./config/cors');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const Logger = require('./utils/logger');

const logger = new Logger('App');

const app = express();

// ========== MIDDLEWARES GLOBALES ==========

// CORS
app.use(corsMiddleware);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logging en desarrollo
if (envConfig.nodeEnv === 'development') {
  app.use((req, res, next) => {
    logger.log(`${req.method} ${req.path}`);
    next();
  });
}

// ========== RUTAS ==========

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use(`${envConfig.api.prefix}/v${envConfig.api.version}`, routes);

// ========== MANEJO DE ERRORES ==========

// 404
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;
