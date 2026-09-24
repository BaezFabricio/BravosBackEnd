const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

const TIPOS = ['peso', 'tiempo', 'repeticiones'];

async function getIdAlumno(idUsuario) {
  const [rows] = await db.query(
    `SELECT a.idAlumno FROM usuario u
     INNER JOIN alumno a ON u.idPersona = a.idPersona
     WHERE u.idUsuario = ?`,
    [idUsuario]
  );
  return rows[0]?.idAlumno ?? null;
}

// Mejor valor de una marca según su tipo: más peso / más reps / menos tiempo
function valorMejorDe(tipo, series) {
  if (tipo === 'peso') return Math.max(...series.map(s => s.peso));
  if (tipo === 'repeticiones') return Math.max(...series.map(s => s.repeticiones));
  return Math.min(...series.map(s => s.tiempoSeg));
}

const esMejor = (tipo, nuevo, previo) => (tipo === 'tiempo' ? nuevo < previo : nuevo > previo);

/** GET /marcas/ejercicios — catálogo general + ejercicios propios del alumno */
exports.listarEjercicios = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const idAlumno = await getIdAlumno(req.user.idUsuario);
  const [rows] = await db.query(
    `SELECT idCatalogo, nombre, tipoMarca, (idAlumno IS NOT NULL) AS propio
     FROM catalogo_ejercicio
     WHERE idAlumno IS NULL OR idAlumno = ?
     ORDER BY propio ASC, nombre ASC`,
    [idAlumno]
  );
  return successResponse(res, 'Ejercicios obtenidos', rows);
});

/**
 * POST /marcas
 * body: { idCatalogo | (nombreNuevo + tipoMarca), fecha, notas, series: [{repeticiones, peso, tiempoSeg}] }
 */
exports.crearMarca = asyncHandler(async (req, res) => {
  const idAlumno = await getIdAlumno(req.user.idUsuario);
  if (!idAlumno) return errorResponse(res, 'No se encontró tu ficha de alumno', 'ALUMNO_NOT_FOUND', 404);

  const { idCatalogo, nombreNuevo, fecha, notas, tipoMarca, series } = req.body;

  if (!Array.isArray(series) || series.length === 0 || series.length > 30) {
    return errorResponse(res, 'Cargá al menos una serie', 'VALIDATION_ERROR', 400);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let idEj = Number(idCatalogo) || null;
    let tipo;
    if (idEj) {
      const [ej] = await conn.query(
        'SELECT tipoMarca FROM catalogo_ejercicio WHERE idCatalogo = ? AND (idAlumno IS NULL OR idAlumno = ?)',
        [idEj, idAlumno]
      );
      if (ej.length === 0) {
        await conn.rollback();
        return errorResponse(res, 'Ejercicio no encontrado', 'NOT_FOUND', 404);
      }
      tipo = ej[0].tipoMarca;
    } else {
      const nombre = String(nombreNuevo || '').trim().slice(0, 100);
      if (!nombre || !TIPOS.includes(tipoMarca)) {
        await conn.rollback();
        return errorResponse(res, 'Indicá el nombre y el tipo de marca del ejercicio', 'VALIDATION_ERROR', 400);
      }
      // Reutiliza el ejercicio propio si ya existe con el mismo nombre
      const [existe] = await conn.query(
        'SELECT idCatalogo, tipoMarca FROM catalogo_ejercicio WHERE idAlumno = ? AND LOWER(nombre) = LOWER(?)',
        [idAlumno, nombre]
      );
      if (existe.length) {
        idEj = existe[0].idCatalogo;
        tipo = existe[0].tipoMarca;
      } else {
        const [ins] = await conn.query(
          'INSERT INTO catalogo_ejercicio (nombre, tipoMarca, idAlumno) VALUES (?, ?, ?)',
          [nombre, tipoMarca, idAlumno]
        );
        idEj = ins.insertId;
        tipo = tipoMarca;
      }
    }

    // Normalizar y validar series según el tipo
    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
    const limpias = [];
    for (const s of series) {
      const reps = numOrNull(s.repeticiones);
      const peso = numOrNull(s.peso);
      const seg = numOrNull(s.tiempoSeg);
      const ok =
        (tipo === 'peso' && peso > 0 && peso < 1000 && (reps == null || reps > 0)) ||
        (tipo === 'repeticiones' && reps > 0 && reps < 10000) ||
        (tipo === 'tiempo' && seg > 0 && seg < 86400 * 2);
      if (!ok) {
        await conn.rollback();
        return errorResponse(res, 'Hay valores inválidos en las series', 'VALIDATION_ERROR', 400);
      }
      limpias.push({ repeticiones: reps, peso, tiempoSeg: seg });
    }

    const valorMejor = valorMejorDe(tipo, limpias);

    const [prev] = await conn.query(
      `SELECT ${tipo === 'tiempo' ? 'MIN' : 'MAX'}(valorMejor) AS mejor
       FROM marca_personal WHERE idAlumno = ? AND idCatalogo = ?`,
      [idAlumno, idEj]
    );
    const mejorPrevio = prev[0].mejor == null ? null : Number(prev[0].mejor);
    const esPR = mejorPrevio === null || esMejor(tipo, valorMejor, mejorPrevio);
    const primera = mejorPrevio === null;

    let fechaOk = String(fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaOk)) {
      const d = new Date();
      fechaOk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const [m] = await conn.query(
      'INSERT INTO marca_personal (idAlumno, idCatalogo, fecha, valorMejor, esPR, notas) VALUES (?, ?, ?, ?, ?, ?)',
      [idAlumno, idEj, fechaOk, valorMejor, esPR ? 1 : 0, notas ? String(notas).slice(0, 255) : null]
    );
    for (let i = 0; i < limpias.length; i++) {
      const s = limpias[i];
      await conn.query(
        'INSERT INTO marca_serie (idMarca, numero, repeticiones, peso, tiempoSeg) VALUES (?, ?, ?, ?, ?)',
        [m.insertId, i + 1, s.repeticiones, s.peso, s.tiempoSeg]
      );
    }

    await conn.commit();
    return successResponse(
      res,
      'Marca registrada',
      { idMarca: m.insertId, esPR, primera, valorMejor, mejorPrevio, tipoMarca: tipo },
      201
    );
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

/** GET /marcas — historial del alumno con sus series */
exports.listarMias = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const idAlumno = await getIdAlumno(req.user.idUsuario);
  if (!idAlumno) return successResponse(res, 'Marcas obtenidas', []);

  const [marcas] = await db.query(
    `SELECT m.idMarca, m.idCatalogo, c.nombre, c.tipoMarca, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha,
            m.valorMejor, m.esPR, m.notas
     FROM marca_personal m
     INNER JOIN catalogo_ejercicio c ON c.idCatalogo = m.idCatalogo
     WHERE m.idAlumno = ?
     ORDER BY m.fecha DESC, m.idMarca DESC`,
    [idAlumno]
  );
  if (marcas.length === 0) return successResponse(res, 'Marcas obtenidas', []);

  // db.query usa sentencias preparadas: un IN necesita un placeholder por valor
  const ids = marcas.map(m => m.idMarca);
  const [series] = await db.query(
    `SELECT idMarca, numero, repeticiones, peso, tiempoSeg FROM marca_serie
     WHERE idMarca IN (${ids.map(() => '?').join(',')}) ORDER BY idMarca, numero`,
    ids
  );
  const porMarca = new Map();
  series.forEach(s => {
    if (!porMarca.has(s.idMarca)) porMarca.set(s.idMarca, []);
    porMarca.get(s.idMarca).push({ ...s, peso: s.peso == null ? null : Number(s.peso) });
  });
  return successResponse(
    res,
    'Marcas obtenidas',
    marcas.map(m => ({ ...m, valorMejor: Number(m.valorMejor), series: porMarca.get(m.idMarca) || [] }))
  );
});

/** DELETE /marcas/:id — borra una marca propia y recalcula el PR del ejercicio */
exports.eliminar = asyncHandler(async (req, res) => {
  const idAlumno = await getIdAlumno(req.user.idUsuario);
  const [rows] = await db.query(
    `SELECT m.idCatalogo, c.tipoMarca FROM marca_personal m
     INNER JOIN catalogo_ejercicio c ON c.idCatalogo = m.idCatalogo
     WHERE m.idMarca = ? AND m.idAlumno = ?`,
    [req.params.id, idAlumno]
  );
  if (rows.length === 0) return errorResponse(res, 'Marca no encontrada', 'NOT_FOUND', 404);

  await db.query('DELETE FROM marca_personal WHERE idMarca = ?', [req.params.id]);

  // Recalcular esPR de todo el ejercicio en orden cronológico
  const { idCatalogo, tipoMarca } = rows[0];
  const [resto] = await db.query(
    `SELECT idMarca, valorMejor FROM marca_personal
     WHERE idAlumno = ? AND idCatalogo = ? ORDER BY fecha ASC, idMarca ASC`,
    [idAlumno, idCatalogo]
  );
  let mejor = null;
  for (const r of resto) {
    const v = Number(r.valorMejor);
    const pr = mejor === null || esMejor(tipoMarca, v, mejor);
    if (pr) mejor = v;
    await db.query('UPDATE marca_personal SET esPR = ? WHERE idMarca = ?', [pr ? 1 : 0, r.idMarca]);
  }
  return successResponse(res, 'Marca eliminada');
});

/** GET /marcas/resumen — estadísticas para los logros */
exports.resumen = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const idAlumno = await getIdAlumno(req.user.idUsuario);
  const vacio = { totalMarcas: 0, superaciones: 0, ejerciciosDistintos: 0, maxPeso: 0 };
  if (!idAlumno) return successResponse(res, 'Resumen', vacio);

  const [[r]] = await db.query(
    `SELECT COUNT(*) AS totalMarcas,
            COALESCE(SUM(esPR), 0) AS prs,
            COUNT(DISTINCT idCatalogo) AS ejerciciosDistintos
     FROM marca_personal WHERE idAlumno = ?`,
    [idAlumno]
  );
  const [[p]] = await db.query(
    `SELECT MAX(s.peso) AS maxPeso FROM marca_serie s
     INNER JOIN marca_personal m ON m.idMarca = s.idMarca WHERE m.idAlumno = ?`,
    [idAlumno]
  );
  const totalMarcas = Number(r.totalMarcas) || 0;
  const ejerciciosDistintos = Number(r.ejerciciosDistintos) || 0;
  // Superación = PR que mejora una marca previa (se descarta el primer registro de cada ejercicio)
  const superaciones = Math.max(0, (Number(r.prs) || 0) - ejerciciosDistintos);
  return successResponse(res, 'Resumen', {
    totalMarcas,
    superaciones,
    ejerciciosDistintos,
    maxPeso: Number(p.maxPeso) || 0,
  });
});
