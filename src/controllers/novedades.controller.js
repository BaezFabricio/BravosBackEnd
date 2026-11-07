const fs = require('fs');
const db = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { limpiarArchivoDeImagen } = require('../utils/imagenes');

/*
 * Novedades del box: avisos que el administrador carga (eventos, promos, comunicados), con foto y un enlace opcional.
 * Se muestran en la portada a quienes tienen sesión iniciada. Cargarlas y editarlas requiere el permiso de configuración.
 */

const TIPOS = ['aviso', 'evento', 'promo', 'comunidad', 'novedad', 'noticia'];
const tipoValido = (v) => (TIPOS.includes(v) ? v : 'aviso');
const esVerdadero = (v) => v === true || v === 'true' || v === '1' || v === 1;
// Opciones de color y tipografía: solo estas claves se guardan (lo demás se descarta)
const COLORES = ['lima', 'celeste', 'amarillo', 'naranja', 'rojo', 'rosa', 'violeta', 'blanco'];
const FUENTES = ['stencil', 'condensada', 'moderna', 'mono'];
const colorValido = (v) => (COLORES.includes(v) ? v : null); // null = el color que corresponde al tipo
const fuenteValida = (v) => (FUENTES.includes(v) ? v : 'stencil');

const TABLA = `
  CREATE TABLE IF NOT EXISTS novedad (
    idNovedad INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(120) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'aviso',
    texto TEXT NOT NULL,
    imagen VARCHAR(500) NULL,
    enlace VARCHAR(500) NULL,
    enlaceTexto VARCHAR(40) NULL,
    colorFondo VARCHAR(20) NULL,
    fuenteTitulo VARCHAR(20) NOT NULL DEFAULT 'stencil',
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
  // Tablas creadas antes de agregar columnas nuevas: se completan las que falten
  const [cols] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novedad'"
  );
  const existentes = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!existentes.has('tipo')) await db.query("ALTER TABLE novedad ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'aviso' AFTER titulo");
  if (!existentes.has('imagen')) await db.query('ALTER TABLE novedad ADD COLUMN imagen VARCHAR(500) NULL AFTER texto');
  if (!existentes.has('enlace')) await db.query('ALTER TABLE novedad ADD COLUMN enlace VARCHAR(500) NULL AFTER imagen');
  if (!existentes.has('enlaceTexto')) await db.query('ALTER TABLE novedad ADD COLUMN enlaceTexto VARCHAR(40) NULL AFTER enlace');
  if (!existentes.has('colorFondo')) await db.query('ALTER TABLE novedad ADD COLUMN colorFondo VARCHAR(20) NULL AFTER enlaceTexto');
  if (!existentes.has('fuenteTitulo')) await db.query("ALTER TABLE novedad ADD COLUMN fuenteTitulo VARCHAR(20) NOT NULL DEFAULT 'stencil' AFTER colorFondo");
  tablaLista = true;
}

const limpiarTitulo = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 120);
const limpiarTexto = (v) => String(v || '').trim().slice(0, 2000);
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());

/**
 * Enlace opcional. Solo http o https (nada de javascript: ni otros esquemas).
 * Devuelve la URL normalizada, null si no se puso ninguno, o undefined si no es válido.
 */
function limpiarEnlace(v) {
  let s = String(v || '').trim().slice(0, 500);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/\s/.test(s) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) return undefined;
    s = `https://${s}`; // "bravosbox.com.ar/x" se guarda como https://bravosbox.com.ar/x
  }
  try {
    const url = new URL(s);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.href.slice(0, 500);
  } catch {
    return undefined;
  }
}

const borrarTemporal = (archivo) => { if (archivo?.path) fs.unlink(archivo.path, () => {}); };

/** Quita los datos ocultos de la foto y la sube a Cloudinary en formato de tarjeta (16:9). Devuelve la URL. */
async function subirImagen(archivo) {
  limpiarArchivoDeImagen(archivo.path); // falla si los bytes no son una imagen
  const resultado = await cloudinary.uploader.upload(archivo.path, {
    folder: 'bravos_novedades',
    width: 1280, height: 720, crop: 'fill', gravity: 'auto',
    quality: 'auto', fetch_format: 'auto', resource_type: 'image',
  });
  return resultado.secure_url;
}

/** Valida y prepara los campos del formulario (llega como multipart: todo es texto). Devuelve { error } o { datos }. */
function leerFormulario(body) {
  const titulo = limpiarTitulo(body?.titulo);
  const texto = limpiarTexto(body?.texto);
  if (!titulo || !texto) return { error: 'Escribí el título y el texto de la novedad' };
  const hasta = body?.hasta ? String(body.hasta) : null;
  if (hasta && !fechaValida(hasta)) return { error: 'La fecha de vencimiento no es válida' };
  const enlace = limpiarEnlace(body?.enlace);
  if (enlace === undefined) return { error: 'El enlace no es válido. Tiene que ser una dirección web, por ejemplo https://bravosbox.com.ar' };
  const enlaceTexto = enlace ? (String(body?.enlaceTexto || '').trim().slice(0, 40) || 'Ver más') : null;
  return {
    datos: {
      titulo,
      texto,
      tipo: tipoValido(body?.tipo),
      activa: body?.activa === undefined || esVerdadero(body.activa) ? 1 : 0,
      hasta,
      enlace,
      enlaceTexto,
      colorFondo: colorValido(body?.colorFondo),
      fuenteTitulo: fuenteValida(body?.fuenteTitulo),
    },
  };
}

const mensajeDeImagen = (err) => (err.message?.startsWith('No es una imagen') ? err.message : 'No se pudo guardar la novedad');

/** GET /novedades/vigentes — las activas y sin vencer (cualquiera con sesión). Solo los campos que se muestran. */
exports.vigentes = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await asegurarTabla();
  const [filas] = await db.query(
    `SELECT idNovedad, titulo, tipo, texto, imagen, enlace, enlaceTexto, colorFondo, fuenteTitulo, DATE_FORMAT(creadaEn, '%d/%m/%Y') AS fecha,
            DATE_FORMAT(hasta, '%d/%m/%Y') AS hasta
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
    `SELECT idNovedad, titulo, tipo, texto, imagen, enlace, enlaceTexto, colorFondo, fuenteTitulo, activa, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta,
            DATE_FORMAT(creadaEn, '%d/%m/%Y') AS fecha,
            (activa = 1 AND (hasta IS NULL OR hasta >= CURDATE())) AS vigente
     FROM novedad ORDER BY creadaEn DESC, idNovedad DESC`
  );
  return successResponse(res, 'Novedades', filas.map((f) => ({ ...f, activa: Boolean(f.activa), vigente: Boolean(f.vigente) })));
});

/** POST /novedades (multipart: titulo, tipo, texto, activa, hasta, enlace, enlaceTexto, imagen opcional) */
exports.crear = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const { error, datos } = leerFormulario(req.body);
  if (error) { borrarTemporal(req.file); return errorResponse(res, error, 'VALIDATION_ERROR', 400); }
  try {
    const imagen = req.file ? await subirImagen(req.file) : null;
    const [ins] = await db.query(
      'INSERT INTO novedad (titulo, tipo, texto, imagen, enlace, enlaceTexto, colorFondo, fuenteTitulo, activa, hasta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [datos.titulo, datos.tipo, datos.texto, imagen, datos.enlace, datos.enlaceTexto, datos.colorFondo, datos.fuenteTitulo, datos.activa, datos.hasta]
    );
    return successResponse(res, 'Novedad publicada', { idNovedad: ins.insertId }, 201);
  } catch (err) {
    return errorResponse(res, mensajeDeImagen(err), 'VALIDATION_ERROR', 400);
  } finally {
    borrarTemporal(req.file);
  }
});

/** PUT /novedades/:id (multipart; imagen nueva reemplaza, quitarImagen=true la borra) */
exports.actualizar = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const [existe] = await db.query('SELECT idNovedad FROM novedad WHERE idNovedad = ?', [req.params.id]);
  if (!existe.length) { borrarTemporal(req.file); return errorResponse(res, 'La novedad no existe', 'NOT_FOUND', 404); }
  const { error, datos } = leerFormulario(req.body);
  if (error) { borrarTemporal(req.file); return errorResponse(res, error, 'VALIDATION_ERROR', 400); }
  try {
    let imagen;
    if (req.file) imagen = await subirImagen(req.file);
    else if (esVerdadero(req.body?.quitarImagen)) imagen = null;
    if (imagen !== undefined) {
      await db.query('UPDATE novedad SET titulo = ?, tipo = ?, texto = ?, activa = ?, hasta = ?, enlace = ?, enlaceTexto = ?, colorFondo = ?, fuenteTitulo = ?, imagen = ? WHERE idNovedad = ?',
        [datos.titulo, datos.tipo, datos.texto, datos.activa, datos.hasta, datos.enlace, datos.enlaceTexto, datos.colorFondo, datos.fuenteTitulo, imagen, req.params.id]);
    } else {
      await db.query('UPDATE novedad SET titulo = ?, tipo = ?, texto = ?, activa = ?, hasta = ?, enlace = ?, enlaceTexto = ?, colorFondo = ?, fuenteTitulo = ? WHERE idNovedad = ?',
        [datos.titulo, datos.tipo, datos.texto, datos.activa, datos.hasta, datos.enlace, datos.enlaceTexto, datos.colorFondo, datos.fuenteTitulo, req.params.id]);
    }
    return successResponse(res, 'Novedad actualizada');
  } catch (err) {
    return errorResponse(res, mensajeDeImagen(err), 'VALIDATION_ERROR', 400);
  } finally {
    borrarTemporal(req.file);
  }
});

/** DELETE /novedades/:id */
exports.eliminar = asyncHandler(async (req, res) => {
  await asegurarTabla();
  const [r] = await db.query('DELETE FROM novedad WHERE idNovedad = ?', [req.params.id]);
  if (!r.affectedRows) return errorResponse(res, 'La novedad no existe', 'NOT_FOUND', 404);
  return successResponse(res, 'Novedad eliminada');
});
