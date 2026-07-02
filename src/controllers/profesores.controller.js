const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse } = require('../utils/response');

// Importaciones de tus archivos de datos
const obtenerProfesoresActivos = require('../data/Profesores/ObtenerProfesoresActivos');
const obtenerAlumnosPorReserva = require('../data/Profesores/ObtenerAlumnosPorReserva');
const obtenerClasesPorProfesor = require('../data/Profesores/ObtenerClasesPorProfesor');

// 1. Obtener todos los profesores
exports.getAll = asyncHandler(async (req, res) => {
  const [profesores] = await db.query(obtenerProfesoresActivos);
  return successResponse(res, 'Profesores activos recuperados correctamente', profesores);
});

exports.getClasesDelProfesor = async (req, res) => {
  const { idProfesor } = req.params;
  
  // 1. Traemos las clases creadas manualmente
  const [clases] = await db.query("SELECT * FROM diaClase WHERE idProfesor = ?", [idProfesor]);

  const [planes] = await db.query("SELECT * FROM plan");

  const clasesConPlan = clases.map(clase => {
    const planMatch = planes.find(p => 
      clase.nombreClase.toLowerCase().includes(p.nombre.toLowerCase())
    );
    return {
      ...clase,
      idPlan: planMatch ? planMatch.idPlan : null,
      nombreClase: clase.nombreClase // Mantenemos el nombre que escribiste
    };
  });

  res.json(clasesConPlan);
};

// 3. Obtener alumnos de una clase por fecha
exports.getAlumnosPorClase = asyncHandler(async (req, res) => {
  const { idClase } = req.params;
  const { fecha } = req.query;

  // ¡NO uses localStorage! Usa req.user que viene de tu middleware de autenticación
  // Asegúrate de que tu middleware de auth.middleware.js ponga el idProfesor en req.user
  const idProfesor = req.user?.idProfesor || 1; 

  const sql = `
    SELECT DISTINCT 
        a.idAlumno AS id, 
        p.nombrecompleto, 
        r.estado AS asistencia
    FROM reserva r
    INNER JOIN alumno a ON r.idAlumno = a.idAlumno
    INNER JOIN persona p ON a.idPersona = p.idPersona
    INNER JOIN horarioclase h ON r.idHorario = h.idHorario
    INNER JOIN diaclase c ON h.idClase = c.idClase
    WHERE c.idClase = ? 
      AND r.fechaReserva = ? 
      AND c.idProfesor = ?
      AND r.estado = 'proxima'
  `;
  
  const [alumnos] = await db.query(sql, [idClase, fecha, idProfesor]);
  return successResponse(res, 'Alumnos recuperados correctamente', alumnos);
});