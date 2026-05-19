/**
 * Constantes de la aplicación
 */

// Roles de usuario
export const ROLES = {
  ADMINISTRADOR: 1,
  ALUMNO: 2,
  PROFESOR: 3,
};

export const ROLE_NAMES = {
  [ROLES.ADMINISTRADOR]: 'Administrador',
  [ROLES.ALUMNO]: 'Alumno',
  [ROLES.PROFESOR]: 'Profesor',
};

// Estados
export const ESTADOS = {
  ACTIVO: 'activo',
  INACTIVO: 'inactivo',
  SUSPENDIDO: 'suspendido',
};

// Tipos de alumno
export const TIPOS_ALUMNO = {
  AMATEUR: 'amateur',
  ATLETA: 'atleta',
};

// Códigos de error personalizados
export const ERROR_CODES = {
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  DUPLICATE_DNI: 'DUPLICATE_DNI',
  DUPLICATE_USERNAME: 'DUPLICATE_USERNAME',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

// Mensajes de error
export const ERROR_MESSAGES = {
  [ERROR_CODES.DUPLICATE_EMAIL]: 'El correo ya está registrado',
  [ERROR_CODES.DUPLICATE_DNI]: 'El DNI ya está registrado',
  [ERROR_CODES.DUPLICATE_USERNAME]: 'El nombre de usuario ya está registrado',
  [ERROR_CODES.USER_NOT_FOUND]: 'Usuario no encontrado',
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Correo o contraseña inválidos',
  [ERROR_CODES.UNAUTHORIZED]: 'No autenticado',
  [ERROR_CODES.FORBIDDEN]: 'Acceso denegado',
  [ERROR_CODES.VALIDATION_ERROR]: 'Datos inválidos',
  [ERROR_CODES.DATABASE_ERROR]: 'Error en la base de datos',
  [ERROR_CODES.INTERNAL_ERROR]: 'Error interno del servidor',
};

// Reglas de validación
export const VALIDATION_RULES = {
  DNI: /^\d{7,10}$/,
  PHONE: /^\d{7,15}$/,
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
  PASSWORD_MIN_LENGTH: 6,
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export default {
  ROLES,
  ROLE_NAMES,
  ESTADOS,
  TIPOS_ALUMNO,
  ERROR_CODES,
  ERROR_MESSAGES,
  VALIDATION_RULES,
  HTTP_STATUS,
};
