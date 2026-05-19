const envConfig = require('../config/env');

/**
 * Simple logger para desarrollo
 * En producción, usar winston o similar
 */
class Logger {
  constructor(module) {
    this.module = module;
  }

  log(message, data = {}) {
    if (envConfig.nodeEnv !== 'production') {
      console.log(`[${this.module}] ${message}`, data);
    }
  }

  info(message, data = {}) {
    console.info(`[INFO] [${this.module}] ${message}`, data);
  }

  warn(message, data = {}) {
    console.warn(`[WARN] [${this.module}] ${message}`, data);
  }

  error(message, error = null) {
    console.error(`[ERROR] [${this.module}] ${message}`, error);
  }

  debug(message, data = {}) {
    if (envConfig.logging.level === 'debug') {
      console.debug(`[DEBUG] [${this.module}] ${message}`, data);
    }
  }
}

module.exports = Logger;
