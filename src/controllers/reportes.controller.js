const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

// Períodos del selector de Reportes. Las fechas se calculan en la base (CURDATE) para no depender
// de la hora del navegador. "prev" es el período anterior del mismo largo, para comparar.
const PERIODOS = {
  // Mes en curso; el anterior es el mes pasado. El gráfico muestra los últimos 6 meses para ver la evolución.
  mes: {
    desde: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
    prevDesde: "DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')",
    prevHasta: "LAST_DAY(CURDATE() - INTERVAL 1 MONTH)",
    graficoDesde: "DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01')",
  },
  // Últimos 3 meses (incluye el actual); el anterior son los 3 meses previos.
  trimestre: {
    desde: "DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01')",
    prevDesde: "DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01')",
    prevHasta: "LAST_DAY(CURDATE() - INTERVAL 3 MONTH)",
    graficoDesde: "DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01')",
  },
  // Año en curso; el anterior es el año pasado.
  anio: {
    desde: "MAKEDATE(YEAR(CURDATE()), 1)",
    prevDesde: "MAKEDATE(YEAR(CURDATE()) - 1, 1)",
    prevHasta: "MAKEDATE(YEAR(CURDATE()), 1) - INTERVAL 1 DAY",
    graficoDesde: "MAKEDATE(YEAR(CURDATE()), 1)",
  },
};

/**
 * GET /reportes/resumen?periodo=mes|trimestre|anio
 * Datos agregados (solo cantidades y totales, ningún dato personal) para el panel de Reportes.
 */
exports.getResumen = asyncHandler(async (req, res) => {
  const periodo = Object.prototype.hasOwnProperty.call(PERIODOS, req.query.periodo) ? req.query.periodo : 'mes';
  const p = PERIODOS[periodo]; // solo expresiones fijas de esta tabla: nada del pedido entra en el SQL

  const [[rango]] = await db.query(`SELECT DATE_FORMAT(${p.desde}, '%Y-%m-%d') AS desde, DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hasta`);

  // Ingresos: total del período, del período anterior y evolución mensual para el gráfico
  const [[ingreso]] = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN fechaPago >= ${p.desde} AND fechaPago < CURDATE() + INTERVAL 1 DAY THEN importe END), 0) AS total,
      COALESCE(SUM(CASE WHEN fechaPago >= ${p.prevDesde} AND fechaPago < ${p.prevHasta} + INTERVAL 1 DAY THEN importe END), 0) AS previo
    FROM pago
    WHERE estadoPago = 'confirmado'
  `);
  const [ingresosPorMes] = await db.query(`
    SELECT DATE_FORMAT(fechaPago, '%Y-%m') AS mes, SUM(importe) AS total
    FROM pago
    WHERE estadoPago = 'confirmado' AND fechaPago >= ${p.graficoDesde} AND fechaPago < CURDATE() + INTERVAL 1 DAY
    GROUP BY mes
    ORDER BY mes ASC
  `);

  // Ingreso por plan en el período (para "plan líder")
  const [ingresoPorPlan] = await db.query(`
    SELECT pl.nombre AS plan, SUM(pa.importe) AS total
    FROM pago pa
    INNER JOIN plan pl ON pa.idPlan = pl.idPlan
    WHERE pa.estadoPago = 'confirmado' AND pa.fechaPago >= ${p.desde} AND pa.fechaPago < CURDATE() + INTERVAL 1 DAY
    GROUP BY pl.nombre
    ORDER BY total DESC
  `);

  // Alumnos con un plan activo hoy (crédito activo y sin vencer), por plan
  const [alumnosPorPlan] = await db.query(`
    SELECT pl.nombre AS plan, COUNT(DISTINCT c.idAlumno) AS cantidad
    FROM credito c
    INNER JOIN pago pa ON c.idPago = pa.idPago
    INNER JOIN plan pl ON pa.idPlan = pl.idPlan
    WHERE c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
    GROUP BY pl.nombre
    ORDER BY cantidad DESC
  `);
  const [[conPlan]] = await db.query(`
    SELECT COUNT(DISTINCT idAlumno) AS total FROM credito WHERE estado = 'ACTIVO' AND fechaVencimiento >= CURDATE()
  `);

  // Ocupación de las clases activas (sin las únicas que ya pasaron)
  // Los días y horarios están en horarioclase (una fila por día; las clases únicas llevan fecha)
  // Ocupados = alumnos anotados en la próxima fecha con reservas de esa clase (reservas reales).
  // Antes era cupoMaximo - cupoDisponible, que no cuenta reservas.
  const [ocupacionClases] = await db.query(`
    SELECT c.nombreClase, c.cupoMaximo,
           (SELECT COUNT(*) FROM reserva r
              INNER JOIN horarioclase hr ON hr.idHorario = r.idHorario
             WHERE hr.idClase = c.idClase AND r.estado = 'proxima'
               AND r.fechaReserva = (SELECT MIN(r2.fechaReserva) FROM reserva r2
                                       INNER JOIN horarioclase h2 ON h2.idHorario = r2.idHorario
                                      WHERE h2.idClase = c.idClase AND r2.estado = 'proxima' AND r2.fechaReserva >= CURDATE())
           ) AS ocupados,
           GROUP_CONCAT(DISTINCT h.dia ORDER BY FIELD(h.dia, 'LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')) AS diasSemana,
           TIME_FORMAT(MIN(h.horaInicio), '%H:%i') AS horaInicio, TIME_FORMAT(MIN(h.horaFin), '%H:%i') AS horaFin,
           DATE_FORMAT(MAX(h.fechaEspecifica), '%Y-%m-%d') AS fechaEspecifica
    FROM diaclase c
    LEFT JOIN horarioclase h ON h.idClase = c.idClase
    WHERE c.estado = 'Activo'
    GROUP BY c.idClase, c.nombreClase, c.cupoMaximo, c.cupoDisponible
    HAVING fechaEspecifica IS NULL OR fechaEspecifica >= DATE_FORMAT(CURDATE(), '%Y-%m-%d')
    ORDER BY ocupados DESC, c.nombreClase
  `);

  // Reservas del período por estado, y las próximas desde hoy
  const [reservasPorEstado] = await db.query(`
    SELECT estado, COUNT(*) AS cantidad
    FROM reserva
    WHERE fechaReserva >= ${p.desde}
    GROUP BY estado
  `);
  const [[proximas]] = await db.query(`
    SELECT COUNT(*) AS total FROM reserva WHERE estado = 'proxima' AND fechaReserva >= CURDATE()
  `);

  return successResponse(res, 'Reportes obtenidos correctamente', {
    periodo,
    rango,
    ingresoTotal: Number(ingreso.total),
    ingresoPrevio: Number(ingreso.previo),
    ingresosPorMes,
    ingresoPorPlan,
    alumnosPorPlan,
    alumnosConPlan: Number(conPlan.total),
    ocupacionClases,
    reservasPorEstado,
    reservasProximas: Number(proximas.total),
  });
});
