-- Las cuentas nuevas se registran como 'pendiente' (sin perfil hasta que el admin asigne uno).
-- La columna no admitía ese valor y, con STRICT_TRANS_TABLES, el registro fallaba.
ALTER TABLE usuario MODIFY COLUMN estado ENUM('activo','inactivo','suspendido','pendiente') DEFAULT 'activo';
