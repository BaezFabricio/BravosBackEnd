const webpush = require('web-push');
const db = require('../config/db');

/*
 * Notificaciones push: llegan al celular o a la computadora aunque la app esté cerrada.
 * Las entregan los servicios de push de cada navegador (Google, Mozilla, Apple, Microsoft),
 * firmadas con las claves VAPID propias del sistema (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el .env).
 *
 * Privacidad: el texto se ve con el teléfono bloqueado, así que nunca lleva montos, DNI, correos
 * ni nada médico. El detalle completo queda en la campanita, dentro de la app.
 */

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const pushActivo = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
if (pushActivo) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[push] Faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT en el .env: no se envían notificaciones push.');
}

// El servidor le envía a la dirección que manda el navegador: si aceptara cualquiera, alguien
// podría usarlo para hacer pedidos a direcciones internas (SSRF). Solo los servicios oficiales.
const SERVICIOS_DE_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge y Android
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari (iPhone y Mac)
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Edge en Windows
];

function endpointValido(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && SERVICIOS_DE_PUSH.some((r) => r.test(url.hostname));
  } catch {
    return false;
  }
}

const MAX_DISPOSITIVOS_POR_USUARIO = 10;

async function crearTablaPush() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS push_suscripcion (
      idSuscripcion INT AUTO_INCREMENT PRIMARY KEY,
      idUsuario INT NOT NULL,
      endpoint VARCHAR(600) NOT NULL,
      p256dh VARCHAR(200) NOT NULL,
      auth VARCHAR(100) NOT NULL,
      creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_endpoint (endpoint),
      FOREIGN KEY (idUsuario) REFERENCES usuario(idUsuario) ON DELETE CASCADE
    )
  `);
}

/**
 * Guarda el dispositivo de quien tiene la sesión. Si ese dispositivo estaba a nombre de otra
 * persona (otra cuenta usó el mismo celular), pasa a ser de la cuenta actual.
 * Devuelve el mensaje del problema, o null si se guardó.
 */
async function guardarSuscripcion(idUsuario, suscripcion) {
  const endpoint = String(suscripcion?.endpoint || '');
  const p256dh = String(suscripcion?.keys?.p256dh || '');
  const auth = String(suscripcion?.keys?.auth || '');
  if (!endpointValido(endpoint) || endpoint.length > 600) return 'La dirección de notificaciones del navegador no es válida.';
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return 'Las claves de notificaciones del navegador no son válidas.';

  const [[{ cantidad }]] = await db.query(
    'SELECT COUNT(*) AS cantidad FROM push_suscripcion WHERE idUsuario = ? AND endpoint <> ?', [idUsuario, endpoint]
  );
  if (Number(cantidad) >= MAX_DISPOSITIVOS_POR_USUARIO) {
    // Se borra el dispositivo más viejo para hacer lugar
    await db.query(
      'DELETE FROM push_suscripcion WHERE idUsuario = ? ORDER BY creadoEn ASC LIMIT 1', [idUsuario]
    );
  }
  await db.query(
    `INSERT INTO push_suscripcion (idUsuario, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE idUsuario = VALUES(idUsuario), p256dh = VALUES(p256dh), auth = VALUES(auth), creadoEn = CURRENT_TIMESTAMP`,
    [idUsuario, endpoint, p256dh, auth]
  );
  return null;
}

/** Borra un dispositivo, solo si es de quien hace el pedido. */
async function borrarSuscripcion(idUsuario, endpoint) {
  await db.query('DELETE FROM push_suscripcion WHERE idUsuario = ? AND endpoint = ?', [idUsuario, String(endpoint || '')]);
}

/**
 * Envía una notificación a todos los dispositivos de un usuario. Nunca rompe el flujo principal.
 * push = { cuerpo, titulo?, url? }
 */
async function enviarPush(idUsuario, push) {
  if (!pushActivo || !push?.cuerpo) return;
  try {
    const [subs] = await db.query(
      'SELECT idSuscripcion, endpoint, p256dh, auth FROM push_suscripcion WHERE idUsuario = ?', [idUsuario]
    );
    const contenido = JSON.stringify({
      titulo: String(push.titulo || 'Bravos Box').slice(0, 80),
      cuerpo: String(push.cuerpo).slice(0, 200),
      // Solo rutas internas de la app: la notificación nunca abre un sitio de afuera
      url: typeof push.url === 'string' && /^\/[A-Za-z0-9/_?=&-]*$/.test(push.url) ? push.url : '/',
    });
    await Promise.all(subs.map(async (s) => {
      if (!endpointValido(s.endpoint)) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          contenido,
          { TTL: 24 * 60 * 60, urgency: 'normal' }
        );
      } catch (err) {
        // 404/410: el dispositivo dio de baja las notificaciones o desinstaló la app
        if (err.statusCode === 404 || err.statusCode === 410) {
          await db.query('DELETE FROM push_suscripcion WHERE idSuscripcion = ?', [s.idSuscripcion]);
        } else {
          console.error('[push] No se pudo enviar:', err.statusCode || err.message);
        }
      }
    }));
  } catch (err) {
    console.error('[push] Error al enviar:', err.message);
  }
}

module.exports = {
  pushActivo,
  clavePublica: () => VAPID_PUBLIC_KEY || null,
  endpointValido,
  crearTablaPush,
  guardarSuscripcion,
  borrarSuscripcion,
  enviarPush,
};
