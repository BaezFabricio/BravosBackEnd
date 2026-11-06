const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

/*
 * Novedades del box: avisos que el administrador carga (eventos, cambios, comunicados). Se muestran en la portada
 * a quienes tienen sesión iniciada, una vez por novedad y por dispositivo (lo guarda el navegador).
 * Cargarlas y editarlas requiere el permiso de configuración (modificación).
 */

const TABLA = `
  CREATE TABLE IF NOT EXISTS novedad (
    idNovedad INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    texto TEXT NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    hasta DATE NULL,
    creadaEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizadaEn TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await db.query(TABLA);
  tablaLista = true;
}

const limpiarTitulo = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 120);
const limpiarTexto = (v) => String(v || '').trim().slice(0, 2000);
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());

/** GET /novedades/vigentes — las activas y sin vencer (cualquiera con sesión) */
exports.vigentes = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await asegurarTabla();
  const [filas] = await db.query(
    `SELECT idNovedad, titulo, texto, DATE_FORMAT(creadaEn, '%Y-%m-%d') AS fecha
     FROM novedad
     WHERE activa = 1 AND (hasta IS NULL OR hasta >= CURDATE())
     ORDER BY creadaEn DESC, idNovedad DESC
     LIMIT 20`
  );
  return successResponse(res, 'Novedades', filas);
});

/** GET /novedades — todas, para administrar (requiere configuración: consulta) */
exports.listar = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await asegurarTabla();
  const [filas] = await db.query(
    `SELECT idNovedad, titulo, texto, activa, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta, DATE_FORMAT(creadaEn, '%Y-%m-%d') AS fecha,
            (activa = 1 AND (hasta IS NULL OR hasta >= CURDATE())) AS vigente
     FROM novedad ORDER BY creadaEn DESC, idNovedad DESC`
  );
  return successResponse(res, 'Novedades', filas.map((f) => ({ ...f, activa: Boolean(f.activa), vigente: Boolean(f.vigente) })));
});

/** POST /novedades { titulo, texto, activa, hasta } */
exports.crear = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const titulo = limpiarTitulo(req.body?.titulo);
  const texto = limpiarTexto(req.body?.texto);
  if (!titulo || !texto) return errorResponse(res, 'Escribí el título y el texto de la novedad', 'VALIDATION_ERROR', 400);
  const hasta = req.body?.hasta ? String(req.body.hasta) : null;
  if (hasta && !fechaValida(hasta)) return errorResponse(res, 'La fecha de vencimiento no es válida', 'VALIDATION_ERROR', 400);
  const [ins] = await db.query(
    'INSERT INTO novedad (titulo, texto, activa, hasta) VALUES (?, ?, ?, ?)',
    [titulo, texto, req.body?.activa === false ? 0 : 1, hasta]
  );
  return successResponse(res, 'Novedad publicada', { idNovedad: ins.insertId }, 201);
});

/** PUT /novedades/:id { titulo, texto, activa, hasta } */
exports.actualizar = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const [existe] = await db.query('SELECT idNovedad FROM novedad WHERE idNovedad = ?', [req.params.id]);
  if (!existe.length) return errorResponse(res, 'La novedad no existe', 'NOT_FOUND', 404);
  const titulo = limpiarTitulo(req.body?.titulo);
  const texto = limpiarTexto(req.body?.texto);
  if (!titulo || !texto) return errorResponse(res, 'Escribí el título y el texto de la novedad', 'VALIDATION_ERROR', 400);
  const hasta = req.body?.hasta ? String(req.body.hasta) : null;
  if (hasta && !fechaValida(hasta)) return errorResponse(res, 'La fecha de vencimiento no es válida', 'VALIDATION_ERROR', 400);
  await db.query(
    'UPDATE novedad SET titulo = ?, texto = ?, activa = ?, hasta = ? WHERE idNovedad = ?',
    [titulo, texto, req.body?.activa === false ? 0 : 1, hasta, req.params.id]
  );
  return successResponse(res, 'Novedad actualizada');
});

/** DELETE /novedades/:id */
exports.eliminar = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const [r] = await db.query('DELETE FROM novedad WHERE idNovedad = ?', [req.params.id]);
  if (!r.affectedRows) return errorResponse(res, 'La novedad no existe', 'NOT_FOUND', 404);
  return successResponse(res, 'Novedad eliminada');
});
