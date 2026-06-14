const express = require('express');
const envConfig = require('./config/env');
const { corsMiddleware } = require('./config/cors');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const authController = require('./controllers/auth.controller');
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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Compatibilidad con enlaces viejos de verificación
app.get('/verificar-cuenta/:token', authController.verificarCuenta);
app.get('/api/auth/verificar/:token', authController.verificarCuenta);

// Test directo
app.get('/test-landing', (req, res) => {
  res.json({
    mensaje: 'El backend sí responde en este puerto',
  });
});

// Landing directa
app.use('/landing', require('./routes/landing.routes.js'));

// API routes globales
const apiV1 = `${envConfig.api.prefix}/v${envConfig.api.version}`;
const apiVV1 = `${envConfig.api.prefix}/vv1`;

app.use(apiV1, routes);
app.use(apiVV1, routes);

// ========== MANEJO DE ERRORES ==========

// 404
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;