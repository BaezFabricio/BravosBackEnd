const { limpiarArchivoDeImagen } = require('../utils/imagenes');
const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const { crearNotificacionAdmins } = require('../functions/notificacion.service');

const { acepto, registrarConsentimiento } = require('../functions/consentimiento');

const TIPOS_VALIDOS = ['comprobante_transferencia', 'certificado_medico', 'declaracion_jurada'];
// Contienen datos de salud: son datos sensibles (Ley 25.326, art. 7) y piden consentimiento expreso.
const TIPOS_SALUD = ['certificado_medico', 'declaracion_jurada'];

// multer ya guardó el archivo antes de llegar acá: si se rechaza el pedido, no tiene que quedar en el disco.
function descartarArchivo(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

/**
 * POST /documentos/subir
 * Sube un documento para el alumno autenticado
 */
async function subirDocumento(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo.' });

    // Las fotos de documentos (comprobantes, estudios) pueden traer ubicación y datos del teléfono: se limpian al recibirlas.
    if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
      try {
        limpiarArchivoDeImagen(req.file.path);
      } catch {
        descartarArchivo(req.file);
        return res.status(400).json({ message: 'La imagen no es válida. Probá con una foto JPG, PNG o WebP.' });
      }
    }

    const { tipo, consienteDatosSalud } = req.body;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      descartarArchivo(req.file);
      return res.status(400).json({ message: 'Tipo de documento inválido.' });
    }
    if (TIPOS_SALUD.includes(tipo) && !acepto(consienteDatosSalud)) {
      descartarArchivo(req.file);
      return res.status(400).json({
        message: 'Para subir este documento tenés que autorizar el uso de tus datos de salud.',
        errorCode: 'CONSENTIMIENTO_REQUERIDO',
      });
    }

    const idUsuario = req.user.idUsuario || req.user.id;

    // Obtener idPersona del usuario
    const [rows] = await db.query('SELECT idPersona FROM usuario WHERE idUsuario = ?', [idUsuario]);
    if (!rows.length) { descartarArchivo(req.file); return res.status(404).json({ message: 'Usuario no encontrado.' }); }
    const idPersona = rows[0].idPersona;

    if (TIPOS_SALUD.includes(tipo)) {
      await registrarConsentimiento(null, { idUsuario, tipo: 'datos_salud', detalle: tipo, ip: req.ip });
    }

    const urlArchivo = `/uploads/documentos/${req.file.filename}`;
    const nombreArchivo = req.file.originalname;

    const [result] = await db.query(
      `INSERT INTO documento_alumno (idPersona, tipo, nombreArchivo, urlArchivo) VALUES (?, ?, ?, ?)`,
      [idPersona, tipo, nombreArchivo, urlArchivo]
    );

    const [doc] = await db.query('SELECT * FROM documento_alumno WHERE idDocumento = ?', [result.insertId]);

    // Notificar a los admins que el alumno subió un comprobante
    const [persona] = await db.query(
      `SELECT p.nombrecompleto FROM persona p
       JOIN usuario u ON u.idPersona = p.idPersona
       WHERE u.idUsuario = ?`,
      [idUsuario]
    );
    const nombreAlumno = persona[0]?.nombrecompleto || 'Un alumno';
    const tipoLabel = {
      comprobante_transferencia: 'comprobante de transferencia',
      certificado_medico: 'certificado médico',
      declaracion_jurada: 'declaración jurada',
    }[tipo] || tipo;

    crearNotificacionAdmins(
      'documentos',
      'Nuevo comprobante',
      `${nombreAlumno} cargó un ${tipoLabel}.`,
      `/admin/usuarios/${idUsuario}`,
    { cuerpo: 'Nuevo comprobante para revisar' }
  ).catch(() => {});

    return res.status(201).json({ data: doc[0] });
  } catch (err) {
    console.error('[Documentos] Error al subir:', err.message);
    return res.status(500).json({ message: 'Error interno al subir el documento.' });
  }
}

/**
 * GET /documentos/mis-documentos
 * Devuelve los documentos del alumno autenticado
 */
async function misDocumentos(req, res) {
  try {
    const idUsuario = req.user.idUsuario || req.user.id;
    const [rows] = await db.query(
      `SELECT d.* FROM documento_alumno d
       JOIN usuario u ON u.idPersona = d.idPersona
       WHERE u.idUsuario = ?
       ORDER BY d.creadoEn DESC`,
      [idUsuario]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[Documentos] Error al obtener mis documentos:', err.message);
    return res.status(500).json({ message: 'Error interno.' });
  }
}

/**
 * GET /documentos/usuario/:id
 * Devuelve los documentos de un usuario específico (admin)
 */
async function documentosPorUsuario(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT d.* FROM documento_alumno d
       JOIN usuario u ON u.idPersona = d.idPersona
       WHERE u.idUsuario = ?
       ORDER BY d.creadoEn DESC`,
      [id]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[Documentos] Error al obtener documentos de usuario:', err.message);
    return res.status(500).json({ message: 'Error interno.' });
  }
}

/**
 * PATCH /documentos/:id/aprobar
 * Marca un documento como aprobado (admin)
 */
async function aprobarDocumento(req, res) {
  try {
    const { id } = req.params;
    const [result] = await db.query(
      `UPDATE documento_alumno SET estado = 'aprobado' WHERE idDocumento = ?`,
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Documento no encontrado.' });
    return res.json({ message: 'Documento aprobado.' });
  } catch (err) {
    console.error('[Documentos] Error al aprobar:', err.message);
    return res.status(500).json({ message: 'Error interno.' });
  }
}

module.exports = { subirDocumento, misDocumentos, documentosPorUsuario, aprobarDocumento };
