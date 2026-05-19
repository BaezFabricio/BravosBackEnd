const jwt = require('jsonwebtoken');
const envConfig = require('../config/env');

/**
 * Genera un token JWT
 */
function generateToken(payload) {
  try {
    const token = jwt.sign(payload, envConfig.jwt.secret, {
      expiresIn: envConfig.jwt.expiresIn,
    });
    return token;
  } catch (error) {
    throw new Error('Error al generar token: ' + error.message);
  }
}

/**
 * Verifica y decodifica un token JWT
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, envConfig.jwt.secret);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw new Error('Error al verificar token: ' + error.message);
  }
}

/**
 * Extrae el token del header Authorization
 */
function extractToken(headers) {
  if (!headers.authorization) {
    return null;
  }

  const parts = headers.authorization.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

module.exports = {
  generateToken,
  verifyToken,
  extractToken,
};
