const { body, validationResult } = require('express-validator');

/**
 * Validaciones para registro de usuario
 */
/**
 */
const validateRegister = [
  body('nombrecompleto')
    .trim()
    .notEmpty()
    .withMessage('El nombre completo es requerido')
    .isLength({ min: 3 })
    .withMessage('El nombre debe tener al menos 3 caracteres'),

  body('dni')
    .trim()
    .notEmpty()
    .withMessage('El DNI es requerido')
    .matches(/^\d{7,10}$/)
    .withMessage('El DNI debe ser numérico y tener entre 7 y 10 dígitos'),

  body('correo')
    .trim()
    .notEmpty()
    .withMessage('El correo es requerido')
    .isEmail()
    .withMessage('El correo debe ser válido')
    .normalizeEmail(),

  body('telefono')
    .trim()
    .optional()
    .matches(/^\d{7,15}$/)
    .withMessage('El teléfono debe ser numérico y tener entre 7 y 15 dígitos'),

  body('username')
    .trim()
    .notEmpty()
    .withMessage('El nombre de usuario es requerido')
    .isLength({ min: 3 })
    .withMessage('El nombre de usuario debe tener al menos 3 caracteres'),

  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),


];

/**
 * Validaciones para login
 */
const validateLogin = [
  body('correo')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('El correo es requerido')
    .isEmail()
    .withMessage('El correo debe ser válido'),

  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida'),
];

/**
 * Validaciones para actualizar usuario
 */
const validateUpdateUser = [
  body('nombrecompleto')
    .trim()
    .optional()
    .isLength({ min: 3 })
    .withMessage('El nombre debe tener al menos 3 caracteres'),

  body('correo')
    .trim()
    .optional()
    .isEmail()
    .withMessage('El correo debe ser válido')
    .normalizeEmail(),

  body('telefono')
    .trim()
    .optional()
    .matches(/^\d{7,15}$/)
    .withMessage('El teléfono debe ser numérico y tener entre 7 y 15 dígitos'),

  body('username')
    .trim()
    .optional()
    .isLength({ min: 3 })
    .withMessage('El nombre de usuario debe tener al menos 3 caracteres')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('El nombre de usuario solo puede contener letras, números, guiones y guiones bajos'),
];

/**
 * Validaciones para cambiar estado
 */
const validateChangeState = [
  body('estado')
    .notEmpty()
    .withMessage('El estado es requerido')
    .isIn(['activo', 'inactivo', 'suspendido'])
    .withMessage('El estado debe ser: activo, inactivo o suspendido'),
];

/**
 * Middleware para manejar errores de validación
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Errores de validación',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateUser,
  validateChangeState,
  handleValidationErrors,
};
