const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

exports.getMetrics = asyncHandler(async (req, res) => {
  try {
    // 1. Tarjeta: Total de alumnos registrados en el gimnasio
    const [totalUsersRows] = await db.query('SELECT COUNT(*) AS total FROM alumno');
    const totalUsuarios = totalUsersRows[0]?.total || 0;

    // 2. Tarjeta: Alumnos con estado activo
    const [activeUsersRows] = await db.query("SELECT COUNT(*) AS activos FROM alumno WHERE estado = 'activo'");
    const usuariosActivos = activeUsersRows[0]?.activos || 0;

    // 3 y 5. Alumnos suspendidos por falta de pago: no tienen ningún crédito vigente
    // (activo, con saldo disponible y sin vencer) y no están dados de baja manualmente.
    const [suspendedListRows] = await db.query(`
      SELECT
        p.dni,
        p.nombrecompleto AS name,
        p.correo AS email,
        COALESCE(DATEDIFF(CURDATE(), ultimoCredito.fechaVencimiento), 0) AS daysOverdue
      FROM alumno a
      INNER JOIN persona p ON a.idPersona = p.idpersona
      LEFT JOIN (
        SELECT c1.idAlumno, MAX(c1.fechaVencimiento) AS fechaVencimiento
        FROM credito c1
        GROUP BY c1.idAlumno
      ) ultimoCredito ON ultimoCredito.idAlumno = a.idAlumno
      WHERE a.estado != 'inactivo'
        AND NOT EXISTS (
          SELECT 1 FROM credito c2
          WHERE c2.idAlumno = a.idAlumno
            AND c2.estado = 'ACTIVO'
            AND c2.creditosCisponibles > 0
            AND c2.fechaVencimiento >= CURDATE()
        )
      ORDER BY daysOverdue DESC
    `);
    const suspendidosCount = suspendedListRows.length;

    // 4. Tarjeta: Membresías (créditos activos) que vencen en los próximos 7 días
    const [porVencerRows] = await db.query(`
      SELECT COUNT(DISTINCT idAlumno) AS total
      FROM credito
      WHERE estado = 'ACTIVO'
        AND fechaVencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    `);
    const membresiasPorVencer = porVencerRows[0]?.total || 0;

    // 6. Tabla Derecha: Clases del Día de Hoy con Ocupación Real (¡Esta mapea con tus capturas de MySQL!)
    const numeroDiaJs = new Date().getDay();
    const mapaDiasBD = { 0: "DOMINGO", 1: "LUNES", 2: "MARTES", 3: "MIERCOLES", 4: "JUEVES", 5: "VIERNES", 6: "SABADO" };
    const diaBuscado = mapaDiasBD[numeroDiaJs];

    const [classesRows] = await db.query(`
      SELECT 
        c.nombreClase,
        h.horaInicio,
        per.nombrecompleto AS coach,
        c.cupoMaximo,
        c.cupoDisponible
      FROM diaclase c
      INNER JOIN horarioclase h ON c.idClase = h.idClase
      LEFT JOIN profesor p ON c.idProfesor = p.idProfesor
      LEFT JOIN persona per ON p.idPersona = per.idPersona
      WHERE h.dia = ? AND c.estado = 'Activo'
      ORDER BY h.horaInicio ASC
    `, [diaBuscado]);

    const clasesDeHoy = classesRows.map(cls => ({
      name: cls.nombreClase,
      time: cls.horaInicio ? cls.horaInicio.slice(0, 5) : "00:00",
      coach: cls.coach || "Staff Bravos",
      spots: `${cls.cupoMaximo - cls.cupoDisponible}/${cls.cupoMaximo}`
    }));

    // 7. Grilla Inferior: Actividad Reciente (Muestra las últimas personas registradas de forma segura)
    const [activityRows] = await db.query(`
    (
      SELECT 
        per.nombrecompleto AS user,
        CONCAT('Reservó: ', dc.nombreClase) AS action,
        r.fechaReserva AS fecha_orden,
        'reservation' AS type
      FROM reserva r
      INNER JOIN alumno al ON r.idAlumno = al.idAlumno
      INNER JOIN persona per ON al.idPersona = per.idPersona
      INNER JOIN horarioclase hc ON r.idHorario = hc.idHorario
      INNER JOIN diaclase dc ON hc.idClase = dc.idClase
      WHERE r.estado = 'proxima'
    )
    UNION ALL
    (
      SELECT 
        per.nombrecompleto AS user,
        CONCAT('Pago recibido: $', p.importe) AS action,
        p.fechaPago AS fecha_orden,
        'payment' AS type
      FROM pago p
      INNER JOIN alumno al ON p.idAlumno = al.idAlumno
      INNER JOIN persona per ON al.idPersona = per.idPersona
      WHERE p.estadoPago = 'confirmado'
    )
    ORDER BY fecha_orden DESC
    LIMIT 10
  `);

    return successResponse(res, 'Métricas completas procesadas correctamente', {
      tarjetas: {
        totalUsuarios,
        usuariosActivos,
        suspendidos: suspendidosCount,
        membresiasPorVencer
      },
      suspendedUsers: suspendedListRows,
      clasesDeHoy,
      recentActivity: activityRows
    });

  } catch (sqlError) {
    // Si algo falla en la base de datos, te lo escupe detallado en la terminal para que sepamos qué cambiar
    console.error("❌ ERROR CRÍTICO EN LA QUERY SQL DEL DASHBOARD:", sqlError.message);
    throw sqlError; // Deja que el errorHandler global responda de forma segura
  }
});