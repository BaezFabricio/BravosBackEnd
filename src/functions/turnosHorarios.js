const db = require('../config/db');

/*
 * Horarios de los turnos del box (los que se publican en Instagram: "Turno mañana 8:00", "Turno siesta 13:10, 14:10, 15:10"…).
 * Se guardan acá, separados por tipo de plan, y el formulario de nueva clase los ofrece como lista para elegir el horario
 * con un toque. Cada clase igual guarda su propia hora de inicio y de fin: cambiar o borrar un horario de esta lista
 * NO modifica ninguna clase ya creada.
 */
const TIPOS_PLAN = ['ClaseCross', 'PlanificacionAtleta'];

// Horario de arranque (14/07). En CrossFit cada clase dura una hora; en Planificación Atletas cada turno es un bloque.
const HORARIOS_INICIALES = [
  ['ClaseCross', 'Mañana', null, '08:00', '09:00'],
  ['ClaseCross', 'Siesta', null, '13:10', '14:10'],
  ['ClaseCross', 'Siesta', null, '14:10', '15:10'],
  ['ClaseCross', 'Siesta', null, '15:10', '16:10'],
  ['ClaseCross', 'Siesta', 'Entrenamiento funcional', '16:10', '17:10'],
  ['ClaseCross', 'Noche', null, '19:00', '20:00'],
  ['ClaseCross', 'Noche', null, '20:00', '21:00'],
  ['ClaseCross', 'Noche', null, '21:00', '22:00'],
  ['PlanificacionAtleta', 'Siesta', null, '17:00', '19:00'],
  ['PlanificacionAtleta', 'Noche', null, '20:00', '22:00'],
];

async function crearTablaTurnosHorarios() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS turno_horario (
      idTurnoHorario INT AUTO_INCREMENT PRIMARY KEY,
      tipoPlan VARCHAR(30) NOT NULL,
      turno VARCHAR(50) NOT NULL,
      etiqueta VARCHAR(60) NULL,
      horaInicio TIME NOT NULL,
      horaFin TIME NOT NULL,
      UNIQUE KEY uq_turno_horario (tipoPlan, horaInicio, horaFin)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  `);
  // Misma collation que plan, diaclase y tipo_clase: si no, MySQL no deja comparar sus columnas entre sí (la tabla se creó antes con otra)
  const [[{ cs }]] = await db.query("SELECT TABLE_COLLATION AS cs FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'turno_horario'");
  if (cs !== 'utf8mb4_general_ci') await db.query('ALTER TABLE turno_horario CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
  // Solo se cargan los horarios de arranque si la tabla está vacía: después son de la dueña y se editan desde la app
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM turno_horario');
  if (Number(n) === 0) {
    // Uno por uno: el acceso a la base usa consultas preparadas y no admite el INSERT de varias filas con un solo ?
    for (const fila of HORARIOS_INICIALES) {
      await db.query('INSERT INTO turno_horario (tipoPlan, turno, etiqueta, horaInicio, horaFin) VALUES (?, ?, ?, ?, ?)', fila);
    }
  }
}

module.exports = { crearTablaTurnosHorarios, TIPOS_PLAN };
