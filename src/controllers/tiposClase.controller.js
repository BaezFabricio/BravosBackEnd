const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { codigoDeNombre } = require('../functions/tiposClase');

// Letras (con tildes), números, espacios y algunos signos. Sin etiquetas ni caracteres raros.
const NOMBRE_VALIDO = /^[\p{L}\p{N}][\p{L}\p{N} .,&+()\/-]*$/u;

function leerNombre(body) {
  const nombre = String(body?.nombre ?? '').replace(/\s+/g, ' ').trim();
  if (nombre.length < 2 || nombre.length > 50 || !NOMBRE_VALIDO.test(nombre)) {
    return { problema: 'El nombre tiene que tener entre 2 y 50 caracteres (letras, números y espacios).' };
  }
  return { nombre };
}

const SELECT_TIPOS = `
  SELECT t.idTipoClase, t.codigo, t.nombre, t.activo,
         (SELECT COUNT(*) FROM plan p WHERE p.tipo = t.codigo) AS planes,
         (SELECT COUNT(*) FROM diaclase d WHERE d.tipoPlan = t.codigo) AS clases,
         (SELECT COUNT(*) FROM turno_horario h WHERE h.tipoPlan = t.codigo) AS horarios
    FROM tipo_clase t`;

const darFormato = (f) => ({
  idTipoClase: f.idTipoClase,
  codigo: f.codigo,
  nombre: f.nombre,
  activo: !!f.activo,
  planes: Number(f.planes) || 0,
  clases: Number(f.clases) || 0,
  horarios: Number(f.horarios) || 0,
});

/** GET /api/tipos-clase */
exports.listar = asyncHandler(async (req, res) => {
  const [filas] = await db.query(`${SELECT_TIPOS} ORDER BY t.idTipoClase`);
  return successResponse(res, 'Tipos de clase obtenidos correctamente', filas.map(darFormato));
});

/** POST /api/tipos-clase */
exports.crear = asyncHandler(async (req, res) => {
  const { nombre, problema } = leerNombre(req.body);
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);

  const [[repetido]] = await db.query('SELECT COUNT(*) AS n FROM tipo_clase WHERE LOWER(nombre) = LOWER(?)', [nombre]);
  if (Number(repetido.n) > 0) return errorResponse(res, 'Ya existe un tipo de clase con ese nombre.', 'DUPLICATE', 409);

  // El código se deriva del nombre y no se repite; después no cambia aunque se renombre el tipo
  const base = codigoDeNombre(nombre);
  let codigo = base;
  for (let i = 2; i < 100; i++) {
    const [[ocupado]] = await db.query('SELECT COUNT(*) AS n FROM tipo_clase WHERE codigo = ?', [codigo]);
    if (Number(ocupado.n) === 0) break;
    codigo = `${base.slice(0, 36)}${i}`;
  }

  try {
    const [r] = await db.query('INSERT INTO tipo_clase (codigo, nombre) VALUES (?, ?)', [codigo, nombre]);
    const [[fila]] = await db.query(`${SELECT_TIPOS} WHERE t.idTipoClase = ?`, [r.insertId]);
    return successResponse(res, 'Tipo de clase creado', darFormato(fila), 201);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return errorResponse(res, 'Ya existe un tipo de clase con ese nombre.', 'DUPLICATE', 409);
    throw error;
  }
});

/** PUT /api/tipos-clase/:id  (cambia el nombre y/o lo activa o desactiva) */
exports.actualizar = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return errorResponse(res, 'Tipo de clase inválido.', 'INVALID_ID', 400);
  const { nombre, problema } = leerNombre(req.body);
  if (problema) return errorResponse(res, problema, 'VALIDATION_ERROR', 400);
  if (typeof req.body?.activo !== 'boolean') return errorResponse(res, 'Indicá si el tipo está activo o no.', 'VALIDATION_ERROR', 400);

  try {
    const [r] = await db.query('UPDATE tipo_clase SET nombre = ?, activo = ? WHERE idTipoClase = ?', [nombre, req.body.activo ? 1 : 0, id]);
    if (r.affectedRows === 0) return errorResponse(res, 'Tipo de clase no encontrado.', 'NOT_FOUND', 404);
    const [[fila]] = await db.query(`${SELECT_TIPOS} WHERE t.idTipoClase = ?`, [id]);
    return successResponse(res, 'Tipo de clase actualizado', darFormato(fila));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return errorResponse(res, 'Ya existe un tipo de clase con ese nombre.', 'DUPLICATE', 409);
    throw error;
  }
});

/** DELETE /api/tipos-clase/:id  (solo si nada lo usa: si no, hay que desactivarlo) */
exports.borrar = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return errorResponse(res, 'Tipo de clase inválido.', 'INVALID_ID', 400);
  const [[fila]] = await db.query(`${SELECT_TIPOS} WHERE t.idTipoClase = ?`, [id]);
  if (!fila) return errorResponse(res, 'Tipo de clase no encontrado.', 'NOT_FOUND', 404);
  if (Number(fila.planes) + Number(fila.clases) + Number(fila.horarios) > 0) {
    return errorResponse(res, 'Este tipo ya tiene planes, clases u horarios. Desactivalo en vez de eliminarlo.', 'IN_USE', 409);
  }
  await db.query('DELETE FROM tipo_clase WHERE idTipoClase = ?', [id]);
  return successResponse(res, 'Tipo de clase eliminado');
});
