/**
 * Envoltura para async/await en controllers
 * Evita try-catch repetido
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Valida que un objeto tenga las propiedades requeridas
 */
function validateRequiredFields(obj, fields) {
  const missing = fields.filter(field => !obj[field]);
  return missing.length > 0 ? missing : null;
}

/**
 * Extrae datos específicos de un objeto
 */
function pickFields(obj, fields) {
  return fields.reduce((result, field) => {
    if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
    return result;
  }, {});
}

/**
 * Genera un ID único (para usar mientras se trabaja localmente)
 */
function generateUniqueId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Verifica si el email es válido
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Verifica si el DNI es válido
 */
function isValidDNI(dni) {
  const dniRegex = /^\d{7,10}$/;
  return dniRegex.test(dni);
}

/**
 * Convierte strings "true"/"false" a boolean
 */
function toBoolean(value) {
  return value === 'true' || value === true || value === 1 || value === '1';
}

module.exports = {
  asyncHandler,
  validateRequiredFields,
  pickFields,
  generateUniqueId,
  isValidEmail,
  isValidDNI,
  toBoolean,
};
