const express = require('express');
const path = require('path');
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

// Cabeceras de seguridad (antes la API no mandaba ninguna y avisaba que corre con Express)
app.disable('x-powered-by');
// Detrás del proxy del servidor (Caddy) la IP real llega en X-Forwarded-For. Solo se activa con TRUST_PROXY=1:
// si no hay proxy delante, cualquiera podría falsear su IP y saltarse el límite de intentos.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (envConfig.nodeEnv === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// CORS
app.use(corsMiddleware);

// Body parsers
// inflate:false: no se descomprimen cuerpos de pedidos (nadie propio los manda comprimidos); ver SEGURIDAD.md, incidente Node.js 10/2026.
// Límite de tamaño: 2 MB para todo, salvo la foto de perfil (llega como imagen en base64). Antes eran 50 MB para cualquier
// pedido, incluso sin sesión, y eso permitía saturar la memoria del servidor con cuerpos enormes.
const jsonNormal = express.json({ limit: '2mb', inflate: false });
const jsonFoto = express.json({ limit: '20mb', inflate: false });
app.use((req, res, next) => (req.method === 'PUT' && /\/usuarios\/\d+\/avatar$/.test(req.path) ? jsonFoto : jsonNormal)(req, res, next));
app.use(express.urlencoded({ limit: '1mb', extended: true, inflate: false }));

// Documentos de alumnos (comprobantes y datos de salud): solo su dueño o un administrador.
// Va antes del estático general para que /uploads/documentos nunca se sirva sin sesión.
const { authenticateToken } = require('./middlewares/auth.middleware');
const { soloDuenoOAdministrador } = require('./middlewares/documentosPrivados.middleware');
app.use(
  '/uploads/documentos',
  authenticateToken,
  soloDuenoOAdministrador,
  express.static(path.join(__dirname, '../uploads/documentos'), { fallthrough: false })
);

// Archivos estáticos (videos de ejercicios, imágenes de la web)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


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