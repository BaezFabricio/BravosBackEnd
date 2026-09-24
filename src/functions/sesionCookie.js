const envConfig = require('../config/env');

// La sesión viaja en una cookie httpOnly: el JavaScript de la página (y por lo tanto un XSS) no puede leerla.
const NOMBRE_COOKIE = 'bravos_token';
const DURACION_MS = 24 * 60 * 60 * 1000; // igual que la vida del JWT

const opciones = () => ({
  httpOnly: true,
  sameSite: 'lax', // no se envía en pedidos que vienen de otros sitios (defensa contra CSRF)
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

function guardarSesion(res, token) {
  res.cookie(NOMBRE_COOKIE, token, { ...opciones(), maxAge: DURACION_MS });
}

function borrarSesion(res) {
  res.clearCookie(NOMBRE_COOKIE, opciones());
}

function leerCookie(headers, nombre) {
  const crudo = headers?.cookie;
  if (!crudo) return null;
  for (const par of crudo.split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(par.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

module.exports = { NOMBRE_COOKIE, guardarSesion, borrarSesion, leerCookie };
