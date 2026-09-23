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

    // El servidor de MySQL corre en un huso horario distinto a Argentina (por
    // ejemplo UTC). Sin esto, CURDATE()/NOW() del lado del servidor no coinciden
    // con "hoy" real, y toda consulta que compare contra CURDATE() falla de noche.
    // La opción `timezone` del driver NO alcanza para esto: solo afecta cómo se
    // parsean fechas del lado del cliente, no lo que MySQL calcula internamente.
    // Hace falta fijarlo con SET en cada conexión física que abre el pool.
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '-03:00'");
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
