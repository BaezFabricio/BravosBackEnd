const mysql = require('mysql2/promise');
const envConfig = require('./env');

let pool;

/**
 * Inicializa el pool de conexiones MySQL
 */
async function initializePool() {
  try {
    pool = mysql.createPool({
      host: envConfig.db.host,
      user: envConfig.db.user,
      password: envConfig.db.password,
      database: envConfig.db.database,
      port: envConfig.db.port,
      waitForConnections: envConfig.db.waitForConnections,
      connectionLimit: envConfig.db.connectionLimit,
      queueLimit: envConfig.db.queueLimit,
    });

    console.log('✓ Pool de conexiones MySQL creado exitosamente');
    return pool;
  } catch (error) {
    console.error('✗ Error inicializando pool:', error.message);
    throw error;
  }
}

/**
 * Obtiene una conexión del pool
 */
async function getConnection() {
  if (!pool) {
    await initializePool();
  }
  return pool.getConnection();
}

/**
 * Ejecuta una query con parámetros preparados
 */
async function query(sql, values = []) {
  let connection;
  try {
    connection = await getConnection();
    const [results] = await connection.execute(sql, values);
    return [results];
  } catch (error) {
    console.error('Error en query:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Ejecuta una query de lectura (SELECT)
 */
async function select(sql, values = []) {
  return query(sql, values);
}

/**
 * Ejecuta una query de escritura (INSERT, UPDATE, DELETE)
 */
async function execute(sql, values = []) {
  return query(sql, values);
}

/**
 * Cierra el pool de conexiones
 */
async function closePool() {
  if (pool) {
    await pool.end();
    console.log('✓ Pool de conexiones cerrado');
  }
}

module.exports = {
  initializePool,
  getConnection,
  query,
  select,
  execute,
  closePool,
};
