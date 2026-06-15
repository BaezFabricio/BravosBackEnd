const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

exports.getMetrics = asyncHandler(async (req, res) => {
  try {
    // 1. Tarjeta: Total de usuarios registrados (desde tu tabla de logins o personas)
    const [totalUsersRows] = await db.query('SELECT COUNT(*) AS total FROM persona');
    const totalUsuarios = totalUsersRows[0]?.total || 0;

    // 2. Tarjeta: Usuarios Activos (Simulado temporalmente en base a tus clases activas hasta que uses tu tabla de pases)
    const [activeUsersRows] = await db.query("SELECT COUNT(*) AS activos FROM persona");
    const usuariosActivos = activeUsersRows[0]?.activos || 0;

    // 3. Tarjeta: Alumnos Suspendidos
    const suspendidosCount = 0; 

    // 4. Tarjeta: Membresías por vencer en los próximos 7 días
    const membresiasPorVencer = 0;

    // 5. Tabla Izquierda: Listado Detallado de Alumnos Suspendidos (Devuelve vacío controlado por ahora)
    const suspendedListRows = [];

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