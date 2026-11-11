/**
 * Filtro de tema SIN gastar tokens.
 *
 * Mira la pregunta con una lista amplia de raíces de palabras del mundo del box y del sistema. Si hay coincidencia,
 * la pregunta pasa directo al asistente. Si no la hay, el controlador hace una consulta mínima al modelo (SI/NO)
 * para no rechazar por error preguntas como "me voy de viaje, ¿qué pasa con mis clases?".
 */

const normalizar = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Raíces: cualquier palabra que EMPIECE así cuenta ("reserv" → reservar, reserva, reservé...)
const RAICES = [
  'credit', 'clase', 'reserv', 'plan', 'pago', 'pagu', 'pagar', 'cuota', 'membres', 'venc', 'abono', 'abonar',
  'entren', 'rutina', 'ejercicio', 'wod', 'horario', 'profe', 'asisten', 'falt', 'cancel', 'viaj', 'vacacion',
  'lesion', 'enferm', 'descuent', 'precio', 'costo', 'cuesta', 'sabado', 'domingo', 'feriado', 'perfil',
  'contrasena', 'cuenta', 'sistema', 'usuario', 'comprobante', 'factura', 'transferen', 'tarjeta', 'mercado',
  'efectivo', 'documento', 'certificado', 'logro', 'marca', 'ranking', 'notific', 'novedad', 'box', 'gimnasio',
  'crossfit', 'cupo', 'turno', 'saldo', 'renov', 'acredit', 'cobr', 'devol', 'pausa', 'congel',
  'permiso', 'modulo', 'reporte', 'ingreso', 'planilla', 'excel', 'configur', 'banco', 'cbu', 'alias', 'whatsapp',
  'check', 'alumno', 'aplicac', 'panel', 'menu', 'pantalla',
];

// Palabras tan cortas que solo cuentan completas (si no, "premio" o "armar" coincidirían por error)
const EXACTAS = new Set(['pr', 'rm', 'app', 'qr']);

function pareceDelTema(pregunta) {
  const palabras = normalizar(pregunta).split(' ').filter(Boolean);
  return palabras.some((p) => EXACTAS.has(p) || RAICES.some((r) => p.startsWith(r)));
}

module.exports = { pareceDelTema, normalizar };
