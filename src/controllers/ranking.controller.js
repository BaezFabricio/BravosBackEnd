const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

const TIPOS = ['peso', 'tiempo', 'repeticiones'];
const RANKING_MAX = 100;

async function getIdAlumno(idUsuario) {
  const [rows] = await db.query(
    `SELECT a.idAlumno FROM usuario u
     INNER JOIN alumno a ON u.idPersona = a.idPersona
     WHERE u.idUsuario = ?`,
    [idUsuario]
  );
  return rows[0]?.idAlumno ?? null;
}

// ───────────────────────── Ranking de RM ─────────────────────────
// Solo cuentan los ejercicios del catálogo general (los propios de cada alumno no se pueden comparar) y los alumnos activos.
// Por alumno se toma su mejor marca: más peso / más repeticiones / menos tiempo. Los empates comparten posición.

async function mejoresDelEjercicio(idCatalogo, tipo, limite) {
  const agg = tipo === 'tiempo' ? 'MIN' : 'MAX';
  const orden = tipo === 'tiempo' ? 'ASC' : 'DESC';
  const [filas] = await db.query(
    `SELECT a.idAlumno, p.nombrecompleto AS nombre, ${agg}(m.valorMejor) AS valor
     FROM marca_personal m
     INNER JOIN alumno a ON a.idAlumno = m.idAlumno
     INNER JOIN persona p ON p.idPersona = a.idPersona
     INNER JOIN usuario u ON u.idPersona = a.idPersona AND u.estado = 'activo'
     WHERE m.idCatalogo = ?
     GROUP BY a.idAlumno, p.nombrecompleto
     ORDER BY valor ${orden}, nombre ASC
     LIMIT ${Number(limite) || RANKING_MAX}`,
    [idCatalogo]
  );
  let posicion = 0;
  let anterior = null;
  return filas.map((f, i) => {
    const valor = Number(f.valor);
    if (valor !== anterior) { posicion = i + 1; anterior = valor; }
    return { idAlumno: f.idAlumno, nombre: f.nombre, valor, posicion };
  });
}

/** GET /marcas/ranking?idCatalogo= — ranking del box por ejercicio (con sesión; el dueño decidió que los nombres son públicos) */
exports.ranking = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const [ejercicios] = await db.query(
    `SELECT c.idCatalogo, c.nombre, c.tipoMarca,
            COUNT(DISTINCT CASE WHEN u.idUsuario IS NOT NULL THEN m.idAlumno END) AS participantes
     FROM catalogo_ejercicio c
     LEFT JOIN marca_personal m ON m.idCatalogo = c.idCatalogo
     LEFT JOIN alumno a ON a.idAlumno = m.idAlumno
     LEFT JOIN usuario u ON u.idPersona = a.idPersona AND u.estado = 'activo'
     WHERE c.idAlumno IS NULL
     GROUP BY c.idCatalogo, c.nombre, c.tipoMarca
     ORDER BY participantes DESC, c.nombre ASC`
  );
  const pedido = Number(req.query.idCatalogo) || null;
  const elegido = ejercicios.find((e) => e.idCatalogo === pedido) || ejercicios[0] || null;
  if (!elegido) return successResponse(res, 'Ranking', { ejercicios: [], ejercicio: null, ranking: [] });

  const miAlumno = await getIdAlumno(req.user.idUsuario);
  const filas = await mejoresDelEjercicio(elegido.idCatalogo, elegido.tipoMarca, RANKING_MAX);
  return successResponse(res, 'Ranking', {
    ejercicios: ejercicios.map((e) => ({ ...e, participantes: Number(e.participantes) })),
    ejercicio: elegido,
    ranking: filas.map(({ idAlumno, ...f }) => ({ ...f, esMio: idAlumno === miAlumno })),
  });
});

/** Ejercicios con alumnos que ya cargaron marcas, el que tiene más participantes primero */
async function ejerciciosConParticipantes() {
  const [ejercicios] = await db.query(
    `SELECT c.idCatalogo, c.nombre, c.tipoMarca,
            COUNT(DISTINCT CASE WHEN u.idUsuario IS NOT NULL THEN m.idAlumno END) AS participantes
     FROM catalogo_ejercicio c
     LEFT JOIN marca_personal m ON m.idCatalogo = c.idCatalogo
     LEFT JOIN alumno a ON a.idAlumno = m.idAlumno
     LEFT JOIN usuario u ON u.idPersona = a.idPersona AND u.estado = 'activo'
     WHERE c.idAlumno IS NULL
     GROUP BY c.idCatalogo, c.nombre, c.tipoMarca
     ORDER BY participantes DESC, c.nombre ASC`
  );
  return ejercicios.map((e) => ({ ...e, participantes: Number(e.participantes) }));
}

const RANKING_PUBLICO_MAX = 20;

/** GET /marcas/ranking-publico?idCatalogo= — página pública del ranking: ejercicios y los primeros 20 de uno (pública a propósito) */
exports.rankingPublico = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  const ejercicios = await ejerciciosConParticipantes(); // todos los ejercicios del box, aunque todavía nadie tenga marca
  const pedido = Number(req.query.idCatalogo) || null;
  const elegido = ejercicios.find((e) => e.idCatalogo === pedido) || ejercicios[0] || null;
  if (!elegido) return successResponse(res, 'Ranking', { ejercicios: [], ejercicio: null, ranking: [] });
  const filas = await mejoresDelEjercicio(elegido.idCatalogo, elegido.tipoMarca, RANKING_PUBLICO_MAX);
  return successResponse(res, 'Ranking', {
    ejercicios,
    ejercicio: elegido,
    ranking: filas.map(({ idAlumno, ...f }) => f),
  });
});

// ───────────────────────── Catálogo de ejercicios (administración) ─────────────────────────

const limpiarNombre = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 100);

/** GET /marcas/catalogo — ejercicios generales con cuántas marcas tiene cada uno */
exports.listarCatalogo = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const [rows] = await db.query(
    `SELECT c.idCatalogo, c.nombre, c.tipoMarca, COUNT(m.idMarca) AS marcas,
            CASE WHEN c.tipoMarca = 'tiempo' THEN MIN(m.valorMejor) ELSE MAX(m.valorMejor) END AS mejorValor
     FROM catalogo_ejercicio c LEFT JOIN marca_personal m ON m.idCatalogo = c.idCatalogo
     WHERE c.idAlumno IS NULL GROUP BY c.idCatalogo, c.nombre, c.tipoMarca ORDER BY c.nombre ASC`
  );
  return successResponse(res, 'Catálogo', rows.map((r) => ({ ...r, marcas: Number(r.marcas), mejorValor: r.mejorValor === null ? null : Number(r.mejorValor) })));
});

/** POST /marcas/catalogo { nombre, tipoMarca } */
exports.crearEjercicio = asyncHandler(async (req, res) => {
  const nombre = limpiarNombre(req.body?.nombre);
  const tipoMarca = req.body?.tipoMarca;
  if (!nombre || !TIPOS.includes(tipoMarca)) {
    return errorResponse(res, 'Indicá el nombre y el tipo de marca del ejercicio', 'VALIDATION_ERROR', 400);
  }
  const [existe] = await db.query('SELECT 1 FROM catalogo_ejercicio WHERE idAlumno IS NULL AND LOWER(nombre) = LOWER(?)', [nombre]);
  if (existe.length) return errorResponse(res, 'Ya existe un ejercicio con ese nombre', 'DUPLICATE', 409);
  const [ins] = await db.query('INSERT INTO catalogo_ejercicio (nombre, tipoMarca, idAlumno) VALUES (?, ?, NULL)', [nombre, tipoMarca]);
  return successResponse(res, 'Ejercicio creado', { idCatalogo: ins.insertId, nombre, tipoMarca, marcas: 0 }, 201);
});

/** PUT /marcas/catalogo/:id { nombre } — solo el nombre: el tipo no cambia, porque las marcas ya cargadas dejarían de tener sentido */
exports.renombrarEjercicio = asyncHandler(async (req, res) => {
  const nombre = limpiarNombre(req.body?.nombre);
  if (!nombre) return errorResponse(res, 'Indicá el nombre del ejercicio', 'VALIDATION_ERROR', 400);
  const [ej] = await db.query('SELECT idCatalogo FROM catalogo_ejercicio WHERE idCatalogo = ? AND idAlumno IS NULL', [req.params.id]);
  if (!ej.length) return errorResponse(res, 'Ejercicio no encontrado', 'NOT_FOUND', 404);
  const [dup] = await db.query('SELECT 1 FROM catalogo_ejercicio WHERE idAlumno IS NULL AND LOWER(nombre) = LOWER(?) AND idCatalogo <> ?', [nombre, req.params.id]);
  if (dup.length) return errorResponse(res, 'Ya existe un ejercicio con ese nombre', 'DUPLICATE', 409);
  await db.query('UPDATE catalogo_ejercicio SET nombre = ? WHERE idCatalogo = ?', [nombre, req.params.id]);
  return successResponse(res, 'Ejercicio actualizado');
});

/** DELETE /marcas/catalogo/:id — solo si nadie cargó marcas (borrarlo borraría las marcas de los alumnos) */
exports.eliminarEjercicio = asyncHandler(async (req, res) => {
  const [ej] = await db.query('SELECT idCatalogo FROM catalogo_ejercicio WHERE idCatalogo = ? AND idAlumno IS NULL', [req.params.id]);
  if (!ej.length) return errorResponse(res, 'Ejercicio no encontrado', 'NOT_FOUND', 404);
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM marca_personal WHERE idCatalogo = ?', [req.params.id]);
  if (Number(n) > 0) return errorResponse(res, 'Ya hay marcas cargadas con este ejercicio: no se puede borrar', 'IN_USE', 409);
  await db.query('DELETE FROM catalogo_ejercicio WHERE idCatalogo = ?', [req.params.id]);
  return successResponse(res, 'Ejercicio eliminado');
});
