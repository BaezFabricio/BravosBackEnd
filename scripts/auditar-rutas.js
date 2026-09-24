#!/usr/bin/env node
/**
 * AUDITOR DE SEGURIDAD DE RUTAS
 *
 * Recorre TODAS las rutas del servidor y comprueba que cada una:
 *   1. exija sesión (authenticateToken), y
 *   2. exija un permiso (requirePermission / requireAnyPermission / allowSelfOrPermission).
 *
 * Las únicas excepciones son las que están escritas abajo, cada una con su motivo.
 * Si alguien agrega una ruta nueva sin protección, este script falla (código 1) y avisa cuál es.
 *
 * Uso:   npm run auditar
 * Se ejecuta solo antes de cada commit (ver .githooks/pre-commit).
 *
 * IMPORTANTE: pasar este auditor NO alcanza. No puede verificar lo que pasa DENTRO de un
 * controlador (por ejemplo, que un usuario no pueda cambiarse su propio perfil, o que un
 * profesor solo toque sus clases). Para eso está la lista de SEGURIDAD.md.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const app = require('../src/app');

// ── Excepciones explícitas ────────────────────────────────────────────────

// Rutas PÚBLICAS a propósito (no piden sesión). Formato: "METODO /ruta".
const PUBLICAS = {
  'POST /api/vv1/auth/registro': 'Registro de cuentas nuevas',
  'POST /api/vv1/auth/login': 'Inicio de sesión',
  'POST /api/vv1/auth/recuperar-contrasena': 'Recuperar contraseña (usa un código enviado por correo)',
  'GET /api/vv1/auth/verificar/:token': 'Verificación de cuenta con el enlace del correo',
  'POST /api/vv1/auth/reenviar-verificacion': 'Reenviar el correo de verificación',
  'POST /api/vv1/pagos/webhook': 'Notificaciones de Mercado Pago: se valida la firma HMAC dentro del controlador',
  'GET /api/vv1/pagos/planes': 'Catálogo de planes y precios (público)',
  'GET /api/vv1/clases/disponibles': 'Grilla de clases visible en la web pública',
  'GET /landing/config': 'Contenido de la web pública y datos de contacto',
  'GET /health': 'Chequeo de que el servidor responde (no devuelve datos)',
  'GET /verificar-cuenta/:token': 'Verificación de cuenta con el enlace del correo (el token es el secreto)',
  'GET /api/auth/verificar/:token': 'Verificación de cuenta con el enlace del correo (el token es el secreto)',
};

// Rutas que piden sesión pero NO un permiso, porque solo tocan datos de LA PROPIA persona
// (el controlador usa la identidad del token, nunca un id recibido del cliente).
const SOLO_AUTENTICADAS = {
  'GET /api/vv1/auth/me': 'Datos de la propia sesión',
  'POST /api/vv1/auth/cambiar-contrasena': 'Cambia la contraseña de la propia sesión',
  'POST /api/vv1/documentos/subir': 'Sube documentos propios',
  'GET /api/vv1/documentos/mis-documentos': 'Lista documentos propios',
  'GET /api/vv1/reservas/mis-creditos-movimientos': 'Créditos y movimientos propios',
  'POST /api/vv1/pagos/crear-preferencia': 'Inicia un pago para la propia persona',
  'POST /api/vv1/pagos/procesar-tarjeta': 'Procesa un pago propio',
  'GET /api/vv1/pagos/estado/:idPlan': 'Estado del propio pago',
  'GET /api/vv1/pagos/mi-plan': 'Membresía propia',
  'GET /api/vv1/pagos/mi-historial': 'Historial de membresías propio',
  'POST /api/vv1/logros/sincronizar': 'Logros propios',
  'GET /api/vv1/profesores/mis-clases': 'Ver mis clases (el controlador exige ser profesor)',
};
// Prefijos completos (todas sus rutas son de datos propios).
const PREFIJOS_SOLO_AUTENTICADOS = {
  '/api/vv1/marcas': 'Marcas personales: siempre del propio alumno',
  '/api/vv1/notificaciones': 'Notificaciones propias',
};

// ── Recorrido de rutas ────────────────────────────────────────────────────

const normalizar = (ruta) =>
  ('/' + ruta).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

function prefijoDe(layer) {
  // Express 4 guarda el montaje como expresión regular: /^\/api\/vv1\/?(?=\/|$)/i
  const src = layer.regexp.source
    .replace('\\/?(?=\\/|$)', '')
    .replace(/^\^/, '')
    .replace(/\\\//g, '/');
  return src;
}

const nombreDe = (fn) => fn.name || '(anónima)';
const esAuth = (fn) => fn.name === 'authenticateToken';
const esPermiso = (fn) => fn.esControlDePermiso === true || fn.name === 'isAdmin';

function recorrer(stack, prefijo, autenticadaAntes, salida) {
  let autenticada = autenticadaAntes;
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack.map((s) => s.handle);
      for (const metodo of Object.keys(layer.route.methods)) {
        salida.push({
          metodo: metodo.toUpperCase(),
          ruta: normalizar(prefijo + layer.route.path),
          autenticada: autenticada || handlers.some(esAuth),
          conPermiso: handlers.some(esPermiso),
          handlers: handlers.map(nombreDe),
        });
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      recorrer(layer.handle.stack, prefijo + prefijoDe(layer), autenticada, salida);
    } else if (esAuth(layer.handle)) {
      // router.use(authenticateToken): protege todas las rutas que vienen después en ese router
      autenticada = true;
    }
  }
}

const rutas = [];
recorrer((app._router || app.router).stack, '', false, rutas);

// La API se monta en dos prefijos (/api/v1 y /api/vv1): se audita una sola vez
const vistas = new Map();
for (const r of rutas) {
  const ruta = r.ruta.replace(/^\/api\/v1(\/|$)/, '/api/vv1$1');
  const clave = `${r.metodo} ${ruta}`;
  const previa = vistas.get(clave);
  // Si la misma ruta figura dos veces, se queda con la versión MENOS protegida
  if (!previa || (previa.autenticada && !r.autenticada) || (previa.conPermiso && !r.conPermiso)) {
    vistas.set(clave, { ...r, ruta, clave });
  }
}

// ── Reglas ────────────────────────────────────────────────────────────────

const problemas = [];
const usadas = new Set();

for (const r of vistas.values()) {
  const esPublica = r.clave in PUBLICAS;
  const prefijoPropio = Object.keys(PREFIJOS_SOLO_AUTENTICADOS).find((p) => r.ruta === p || r.ruta.startsWith(p + '/'));
  const esPropia = r.clave in SOLO_AUTENTICADAS || Boolean(prefijoPropio);
  if (esPublica) usadas.add(r.clave);
  if (r.clave in SOLO_AUTENTICADAS) usadas.add(r.clave);

  if (esPublica) {
    if (r.autenticada) problemas.push({ ...r, motivo: 'Está en PUBLICAS pero pide sesión: sacala de la lista' });
    continue;
  }
  if (!r.autenticada) {
    problemas.push({ ...r, motivo: 'NO EXIGE SESIÓN (cualquiera, sin iniciar sesión, puede usarla)' });
    continue;
  }
  if (!r.conPermiso && !esPropia) {
    problemas.push({ ...r, motivo: 'Exige sesión pero NO un permiso: cualquier usuario logueado puede usarla' });
  }
}

// Entradas de las listas que ya no corresponden a ninguna ruta (se quedaron viejas)
const obsoletas = [...Object.keys(PUBLICAS), ...Object.keys(SOLO_AUTENTICADAS)].filter((k) => !vistas.has(k));

// ── Salida ────────────────────────────────────────────────────────────────

const total = vistas.size;
console.log(`\nAuditoría de rutas: ${total} rutas revisadas\n`);

if (problemas.length === 0) {
  console.log('✔ Todas las rutas exigen sesión y permiso (o están en la lista de excepciones justificadas).');
} else {
  console.log(`✖ ${problemas.length} ruta(s) sin la protección necesaria:\n`);
  for (const p of problemas) {
    console.log(`  ${p.clave}`);
    console.log(`     → ${p.motivo}`);
    console.log(`     → middlewares: ${p.handlers.join(', ') || '(ninguno)'}\n`);
  }
  console.log('Cómo arreglarlo: agregá authenticateToken y requirePermission(modulo, accion) a la ruta.');
  console.log('Si es a propósito pública o de datos propios, agregala a las listas de scripts/auditar-rutas.js con su motivo.\n');
}

if (obsoletas.length) {
  console.log(`Aviso: ${obsoletas.length} excepción(es) de las listas ya no corresponden a ninguna ruta:`);
  obsoletas.forEach((k) => console.log(`  - ${k}`));
  console.log('');
}

process.exit(problemas.length ? 1 : 0);
