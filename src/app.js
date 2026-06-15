const express = require('express');
const envConfig = require('./config/env');
const { corsMiddleware } = require('./config/cors');

const routes = require('./routes/index.js');
const profesoresRouter = require('./routes/profesores.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const { errorHandler, notFoundHandler } = require('./middlewares/error.middleware');
const authController = require('./controllers/auth.controller');
const Logger = require('./utils/logger');

const logger = new Logger('App');
const app = express();


// ========== MIDDLEWARES GLOBALES ==========

// CORS
app.use(corsMiddleware);

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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


const landingRoutes = require('./routes/landing.routes.js');
app.use('/landing', landingRoutes.default || landingRoutes);

// API routes globales
const apiV1 = `${envConfig.api.prefix}/v${envConfig.api.version}`;

const apiVV1 = `${envConfig.api.prefix}/vv1`;

app.use(apiV1, routes);
app.use(apiVV1, routes);

app.use('/api/vv1/profesores', profesoresRouter);

app.use('/api/vv1/dashboard', dashboardRoutes);


// ========== MANEJO DE ERRORES ==========

// 404
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;