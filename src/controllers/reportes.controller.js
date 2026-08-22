const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

/**
 * GET /reportes/resumen
 * Devuelve los datasets agregados para el panel de Reportes del admin:
 * ingresos por mes, alumnos por plan, ocupación de clases y reservas por estado.
 */
exports.getResumen = asyncHandler(async (req, res) => {
  const [ingresosPorMes] = await db.query(`
    SELECT DATE_FORMAT(fechaPago, '%Y-%m') AS mes, SUM(importe) AS total
    FROM pago
    WHERE estadoPago = 'confirmado'
    GROUP BY mes
    ORDER BY mes ASC
  `);

  const [alumnosPorPlan] = await db.query(`
    SELECT pl.nombre AS plan, COUNT(DISTINCT pa.idAlumno) AS cantidad
    FROM pago pa
    INNER JOIN plan pl ON pa.idPlan = pl.idPlan
    WHERE pa.estadoPago = 'confirmado'
    GROUP BY pl.nombre
    ORDER BY cantidad DESC
  `);

  const [ocupacionClases] = await db.query(`
    SELECT
      nombreClase,
      cupoMaximo,
      (cupoMaximo - cupoDisponible) AS ocupados
    FROM diaclase
    WHERE estado = 'Activo'
    ORDER BY nombreClase
  `);

  const [reservasPorEstado] = await db.query(`
    SELECT estado, COUNT(*) AS cantidad
    FROM reserva
    GROUP BY estado
  `);

  const [ingresoTotalRows] = await db.query(`
    SELECT COALESCE(SUM(importe), 0) AS total
    FROM pago
    WHERE estadoPago = 'confirmado'
  `);

  return successResponse(res, 'Reportes obtenidos correctamente', {
    ingresosPorMes,
    alumnosPorPlan,
    ocupacionClases,
    reservasPorEstado,
    ingresoTotal: ingresoTotalRows[0].total,
  });
});
