const db = require('../config/db');

/*
 * Tipos de clase del box (CrossFit, Planificación Atleta, y los que se agreguen desde la app).
 * El tipo es lo que une planes, clases y reservas: un plan es de un tipo, una clase es de un tipo, y un alumno puede
 * reservar una clase si tiene créditos vigentes de CUALQUIER plan de ese mismo tipo. El nombre del plan ("Crossfit x3",
 * "cros x3"…) es solo texto para mostrar: el sistema nunca lo lee.
 * `codigo` es lo que se guarda en plan.tipo, diaclase.tipoPlan y turno_horario.tipoPlan; no cambia nunca. Lo que se edita es `nombre`.
 */
const TIPOS_INICIALES = [
  ['ClaseCross', 'CrossFit'],
  ['PlanificacionAtleta', 'Planificación Atleta'],
];

async function existeColumna(tabla, columna) {
  const [filas] = await db.query(
    'SELECT DATA_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tabla, columna]
  );
  return filas.length ? String(filas[0].tipo).toLowerCase() : null;
}

async function crearTablaTiposClase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tipo_clase (
      idTipoClase INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(40) NOT NULL,
      nombre VARCHAR(50) NOT NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uq_tipo_clase_codigo (codigo),
      UNIQUE KEY uq_tipo_clase_nombre (nombre)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM tipo_clase');
  if (Number(n) === 0) {
    for (const fila of TIPOS_INICIALES) {
      await db.query('INSERT INTO tipo_clase (codigo, nombre) VALUES (?, ?)', fila);
    }
  }

  // plan.tipo era un ENUM de dos valores: pasa a texto para poder tener los tipos que se creen. Los valores guardados no cambian.
  if ((await existeColumna('plan', 'tipo')) === 'enum') {
    await db.query('ALTER TABLE plan MODIFY tipo VARCHAR(40) NOT NULL');
  }

  // Cada clase guarda su tipo (antes guardaba un plan puntual). Las clases que ya existían toman el tipo de su plan.
  if (!(await existeColumna('diaclase', 'tipoPlan'))) {
    await db.query('ALTER TABLE diaclase ADD COLUMN tipoPlan VARCHAR(40) NULL AFTER idPlan');
  }
  await db.query(
    `UPDATE diaclase d INNER JOIN plan p ON p.idPlan = d.idPlan
        SET d.tipoPlan = p.tipo
      WHERE d.tipoPlan IS NULL`
  );
}

/** Código interno a partir del nombre: sin tildes ni símbolos, en PascalCase ("Funcional Kids" -> "FuncionalKids"). */
function codigoDeNombre(nombre) {
  const base = String(nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  return base.slice(0, 36) || 'Tipo';
}

/** ¿Existe este tipo (y está activo, si se pide)? */
async function tipoExiste(codigo, { soloActivos = false } = {}) {
  if (typeof codigo !== 'string' || !codigo) return false;
  const [filas] = await db.query(
    `SELECT activo FROM tipo_clase WHERE codigo = ?${soloActivos ? ' AND activo = 1' : ''}`,
    [codigo]
  );
  return filas.length > 0;
}

module.exports = { crearTablaTiposClase, codigoDeNombre, tipoExiste, TIPOS_INICIALES };
