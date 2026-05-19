const bcrypt = require('bcrypt');

/**
 * Hashea una contraseña usando bcrypt
 */
async function hashPassword(password) {
  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    throw new Error('Error al hashear contraseña: ' + error.message);
  }
}

/**
 * Compara una contraseña con su hash
 */
async function comparePassword(inputPassword, storedHash) {
  try {
    const isMatch = await bcrypt.compare(inputPassword, storedHash);
    return isMatch;
  } catch (error) {
    throw new Error('Error al comparar contraseña: ' + error.message);
  }
}

module.exports = {
  hashPassword,
  comparePassword,
};
