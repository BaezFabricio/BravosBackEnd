const crypto = require('crypto');
const db = require('../config/db');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');
const { crearNotificacionAdmins } = require('../functions/notificacion.service');
const { sendArrepentimientoEmails } = require('../functions/email.service');

/**
 * POST /arrepentimiento  (pública a propósito)
 * Botón de arrepentimiento (Res. SCI 424/2020): cualquiera puede pedir revocar una compra
 * sin iniciar sesión, y recibe en el momento un código que deja constancia del pedido.
 * No toca pagos ni créditos: el reintegro lo revisa y lo hace un administrador.
 */
exports.crearSolicitud = asyncHandler(async (req, res) => {
  const limpiar = (v, max) => String(v ?? '').trim().slice(0, max);
  const nombre = limpiar(req.body.nombre, 150);
  const dni = limpiar(req.body.dni, 10).replace(/\D/g, '');
  const correo = limpiar(req.body.correo, 150).toLowerCase();
  const telefono = limpiar(req.body.telefono, 30) || null;
  const detalle = limpiar(req.body.detalle, 500) || null;
  const fechaTxt = limpiar(req.body.fechaCompra, 10);

  if (nombre.length < 3) return errorResponse(res, 'Ingresá tu nombre completo.', 'INVALID_NOMBRE', 400);
  if (!/^\d{7,10}$/.test(dni)) return errorResponse(res, 'Ingresá un DNI válido.', 'INVALID_DNI', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return errorResponse(res, 'Ingresá un correo válido.', 'INVALID_CORREO', 400);
  let fechaCompra = null;
  if (fechaTxt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTxt)) return errorResponse(res, 'La fecha de compra no es válida.', 'INVALID_FECHA', 400);
    fechaCompra = fechaTxt;
  }

  const codigo = `ARR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  await db.query(
    `INSERT INTO solicitud_arrepentimiento (codigo, nombre, dni, correo, telefono, fechaCompra, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [codigo, nombre, dni, correo, telefono, fechaCompra, detalle, req.ip ? String(req.ip).slice(0, 45) : null]
  );

  crearNotificacionAdmins(
    'sistema',
    'Solicitud de arrepentimiento',
    `${nombre} (DNI ${dni}, ${correo}) pidió revocar una compra. Código ${codigo}. Hay que responder y reintegrar si corresponde.`,
    null,
    { propio: true, titulo: 'Solicitud de arrepentimiento', cuerpo: `${nombre} pidió revocar una compra · código ${codigo}` }
  ).catch(() => {});
  sendArrepentimientoEmails({ codigo, nombre, dni, correo, telefono, fechaCompra, detalle }).catch(() => {});

  // Solo se devuelve el código: nada de datos de cuentas existentes.
  return successResponse(res, 'Solicitud registrada', { codigo }, 201);
});
