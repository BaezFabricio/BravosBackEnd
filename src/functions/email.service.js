const nodemailer = require('nodemailer');
const path = require('path');

// Forzamos a este archivo a leer directamente el .env por si el pasamanos de config falla
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
}); 

// Configuramos el transportador inyectando process.env directamente
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true para puerto 465
  auth: {
    user: process.env.SMTP_USER, // Lee directo del .env
    pass: process.env.SMTP_PASS  // Lee directo del .env
  }
});

/**
 * Función para enviar el correo con el enlace de verificación
 */
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sendVerificationEmail = async (email, nombre, token) => {
  // Construir la URL de verificación usando la interfaz del frontend existente
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const urlVerificacion = `${frontendUrl}/verificar-cuenta/${token}`;
  const primerNombre = escapar(String(nombre || '').trim().split(/\s+/)[0]);

  const mailOptions = {
    from: `"Bravos Box" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Activá tu cuenta de Bravos Box',
    text: `Hola${primerNombre ? ' ' + primerNombre : ''}, creaste tu cuenta en Bravos Box. Para activarla abrí este enlace: ${urlVerificacion}

Si no fuiste vos, ignorá este correo y no se creará nada.`,
    html: `
      <div style="background:#0e100a;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#16190f;border:1px solid #3a3d32;border-radius:12px;padding:32px 28px;color:#ecefe4;">
          <p style="margin:0 0 20px;font-size:13px;letter-spacing:.3em;font-weight:900;color:#9be600;">BRAVOS BOX</p>
          <h1 style="margin:0 0 14px;font-size:26px;line-height:1.15;text-transform:uppercase;color:#ecefe4;">¡Último paso${primerNombre ? ', ' + primerNombre : ''}!</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#c9cdbd;">
            Tu cuenta ya está creada. Tocá el botón para activarla y empezar a reservar tus clases.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${urlVerificacion}" style="background:#9be600;color:#0b0c09;padding:16px 36px;text-decoration:none;font-size:17px;font-weight:900;letter-spacing:.08em;border-radius:8px;display:inline-block;text-transform:uppercase;">Activar mi cuenta</a>
          </div>
          <p style="margin:0 0 6px;font-size:13px;color:#8a8f7a;">Si el botón no funciona, copiá y pegá esta dirección en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${urlVerificacion}" style="color:#9be600;">${urlVerificacion}</a></p>
          <hr style="border:none;border-top:1px dashed #3a3d32;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f7a;">
            ¿No fuiste vos? Ignorá este correo: sin activar el enlace no se crea nada.<br>
            Es un mensaje automático de Bravos Box, por favor no lo respondas.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email Real] Enlace de verificación enviado a: ${email}`);
  } catch (error) {
    console.error('[Email Error] Falla en el envío SMTP:', error);
    throw new Error('No se pudo despachar el correo de verificación');
  }
};

/**
 * Enlace para crear una contraseña nueva (token de un solo uso; ver functions/recuperacion.js).
 * El token no se escribe en los registros del servidor.
 */
const sendRecoveryEmail = async (email, nombre, token, minutos) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const enlace = `${frontendUrl}/recuperar-contrasena?token=${encodeURIComponent(token)}`;
  const mailOptions = {
    from: `"Bravos Box" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Creá tu nueva contraseña — Bravos Box',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background: #111111; padding: 28px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 900; text-transform: uppercase; margin: 0;">Recuperar contraseña</h1>
        </div>
        <div style="padding: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">Hola <strong>${escapeHtml(nombre || '')}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            Recibimos un pedido para cambiar la contraseña de tu cuenta. Tocá el botón para crear una nueva.
            El enlace sirve <strong>una sola vez</strong> y vence en <strong>${minutos} minutos</strong>.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${enlace}" style="background-color: #a3e635; color: #000; padding: 14px 36px; text-decoration: none; font-size: 14px; font-weight: 900; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">
              Crear nueva contraseña
            </a>
          </div>
          <p style="font-size: 13px; color: #888; line-height: 1.5; margin: 0;">
            Si no pediste cambiar la contraseña, ignorá este correo: tu contraseña actual sigue funcionando.
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Enlace de recuperación enviado a: ${email}`);
  } catch (error) {
    console.error('[Email Error] Falla en el envío SMTP (recuperación):', error.message);
    throw new Error('No se pudo enviar el correo de recuperación');
  }
}

/**
 * Notifica a un alumno que una clase ya está abierta para reservar.
 */
const sendClaseDisponibleEmail = async (email, nombre, clase) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const urlReservas = `${frontendUrl}/alumno/clases`;

  const fechaStr = clase.fechaEspecifica
    ? (() => {
        const raw = clase.fechaEspecifica instanceof Date
          ? clase.fechaEspecifica.toISOString()
          : String(clase.fechaEspecifica);
        const [y, m, d] = raw.split('T')[0].split('-').map(Number);
        const f = new Date(y, m - 1, d);
        return f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      })()
    : clase.diasSemana || '';

  const mailOptions = {
    from: `"Bravos Box 🏋️‍♂️" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `¡Nueva clase disponible: ${clase.nombreClase}! 💪`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: #111111; padding: 28px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 26px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px;">¡Clase disponible!</h1>
        </div>

        <div style="padding: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">Hola <strong>${nombre}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            La clase <strong style="color: #111;">${clase.nombreClase}</strong> ya está abierta para reservas. ¡No te quedes sin lugar!
          </p>

          <div style="background: #f8f8f8; border-left: 4px solid #a3e635; padding: 16px 20px; margin-bottom: 28px; border-radius: 0 6px 6px 0;">
            ${clase.nombrePlan ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #666;">🏷️ <strong>Tipo de clase:</strong> ${clase.nombrePlan}</p>` : ''}
            ${clase.nombreProfesor ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #666;">👟 <strong>Coach:</strong> ${clase.nombreProfesor}</p>` : ''}
            ${fechaStr ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #666;">📅 <strong>Fecha:</strong> ${fechaStr}</p>` : ''}
            ${clase.horaInicio ? `<p style="margin: 0; font-size: 13px; color: #666;">🕐 <strong>Horario:</strong> ${clase.horaInicio.substring(0,5)} hs</p>` : ''}
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${urlReservas}" style="background-color: #a3e635; color: #000; padding: 14px 40px; text-decoration: none; font-size: 14px; font-weight: 900; border-radius: 5px; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">
              Reservar ahora →
            </a>
          </div>

          <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 14px 18px; margin-top: 8px;">
            <p style="margin: 0; font-size: 13px; color: #795548; line-height: 1.5;">
              💡 <strong>Tip:</strong> Necesitás reservar primero para poder ver la rutina de la clase. Una vez que confirmás tu lugar, la rutina queda disponible en tu perfil.
            </p>
          </div>
        </div>

        <div style="background: #f5f5f5; padding: 16px 32px; text-align: center;">
          <p style="font-size: 11px; color: #999; margin: 0;">Este correo fue generado automáticamente por Bravos Box. No respondas este mensaje.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Clase disponible enviado a: ${email}`);
  } catch (error) {
    console.error(`[Email Error] Falla enviando clase disponible a ${email}:`, error.message);
  }
};

/**
 * Aviso de membresía por vencer — se envía entre el 1 y el 9 del mes
 */
const sendMembresiaPorVencerEmail = async (email, nombre, diasRestantes) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

  const mailOptions = {
    from: `"Bravos Box 🏋️‍♂️" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `⚠️ Tu membresía vence el 10 — renovála antes de quedar inactivo`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; overflow: hidden;">
        <div style="background: #111111; padding: 28px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px;">Renová tu membresía</h1>
        </div>

        <div style="padding: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">Hola <strong>${nombre}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            Te recordamos que la fecha límite de pago es el <strong style="color: #111;">día 10 de cada mes</strong>.
            ${diasRestantes !== null ? `Te quedan <strong>${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}</strong> para renovar.` : 'El plazo vence pronto.'}
          </p>

          <div style="background: #fff8e1; border-left: 4px solid #f59e0b; padding: 16px 20px; margin-bottom: 28px;">
            <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.5;">
              Si no abonás antes del día 10, tu cuenta quedará <strong>suspendida</strong> y no podrás reservar clases.
            </p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${frontendUrl}/alumno/creditos" style="background-color: #a3e635; color: #000; padding: 14px 40px; text-decoration: none; font-size: 14px; font-weight: 900; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">
              Ver mi membresía →
            </a>
          </div>
        </div>

        <div style="background: #f5f5f5; padding: 16px 32px; text-align: center;">
          <p style="font-size: 11px; color: #999; margin: 0;">Este correo fue generado automáticamente por Bravos Box. No respondas este mensaje.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Aviso membresía enviado a: ${email}`);
  } catch (error) {
    console.error(`[Email Error] Aviso membresía a ${email}:`, error.message);
  }
};

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Comprobante de pago: se envía al alumno cuando se acredita su membresía.
 * Como los otros avisos, nunca lanza: un fallo de SMTP no debe afectar la
 * acreditación, que ya quedó guardada.
 */
const sendPagoConfirmadoEmail = async (email, nombre, { plan, importe, creditos, vencimiento, referencia }) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const monto = Number(importe).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const venc = vencimiento
    ? new Date(vencimiento).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const fila = (label, valor) => `
    <tr>
      <td style="padding: 10px 0; font-size: 13px; color: #777; border-bottom: 1px solid #eee;">${label}</td>
      <td style="padding: 10px 0; font-size: 14px; color: #111; font-weight: bold; text-align: right; border-bottom: 1px solid #eee;">${valor}</td>
    </tr>`;

  const mailOptions = {
    from: `"Bravos Box 🏋️‍♂️" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '✅ Pago confirmado — tu membresía está activa',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background: #111111; padding: 28px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px;">¡Pago confirmado!</h1>
        </div>

        <div style="padding: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            Recibimos tu pago y tu membresía ya está activa. Ya podés reservar tus clases.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
            ${fila('Plan', escapeHtml(plan))}
            ${fila('Importe', `$${monto}`)}
            ${creditos != null ? fila('Créditos', escapeHtml(creditos)) : ''}
            ${venc ? fila('Vence el', venc) : ''}
            ${referencia ? fila('N° de operación', `<span style="font-size: 12px;">${escapeHtml(referencia)}</span>`) : ''}
          </table>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${frontendUrl}/alumno/creditos" style="background-color: #a3e635; color: #000; padding: 14px 40px; text-decoration: none; font-size: 14px; font-weight: 900; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">
              Ver mis créditos →
            </a>
          </div>
        </div>

        <div style="background: #f5f5f5; padding: 16px 32px; text-align: center;">
          <p style="font-size: 11px; color: #999; margin: 0;">Este correo fue generado automáticamente por Bravos Box. No respondas este mensaje.</p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Comprobante de pago enviado a: ${email}`);
  } catch (error) {
    console.error(`[Email Error] Comprobante de pago a ${email}:`, error.message);
  }
};

/**
 * Botón de arrepentimiento (Res. SCI 424/2020): constancia con el código para quien lo pidió
 * y aviso al correo del box con los datos de la solicitud.
 */
const sendArrepentimientoEmails = async ({ codigo, nombre, dni, correo, telefono, fechaCompra, detalle }) => {
  const fila = (label, valor) => valor ? `
    <tr>
      <td style="padding: 8px 0; font-size: 13px; color: #777; border-bottom: 1px solid #eee;">${label}</td>
      <td style="padding: 8px 0; font-size: 14px; color: #111; font-weight: bold; text-align: right; border-bottom: 1px solid #eee;">${escapeHtml(valor)}</td>
    </tr>` : '';
  const tabla = `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0 24px 0;">
      ${fila('Código', codigo)}
      ${fila('Nombre', nombre)}
      ${fila('DNI', dni)}
      ${fila('Correo', correo)}
      ${fila('Teléfono', telefono)}
      ${fila('Fecha de la compra', fechaCompra)}
      ${fila('Detalle', detalle)}
    </table>`;

  const alCliente = {
    from: `"Bravos Box" <${process.env.SMTP_USER}>`,
    to: correo,
    subject: `Recibimos tu solicitud de arrepentimiento — código ${codigo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background: #111111; padding: 24px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 22px; font-weight: 900; margin: 8px 0 0 0;">Solicitud de arrepentimiento recibida</h1>
        </div>
        <div style="padding: 28px 32px;">
          <p style="font-size: 15px; color: #333; margin: 0 0 12px 0;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0;">
            Registramos tu pedido para revocar la compra. Guardá este código: es la constancia de tu solicitud.
            Te vamos a contactar para coordinar el reintegro, que se hace por el mismo medio con el que pagaste.
          </p>
          ${tabla}
          <p style="font-size: 12px; color: #888; line-height: 1.5; margin: 0;">
            Tenés derecho a revocar la aceptación dentro de los 10 días corridos desde la compra, sin costo ni responsabilidad
            (Ley 24.240, art. 34, y Código Civil y Comercial, arts. 1110 a 1116).
          </p>
        </div>
      </div>`,
  };

  const alBox = {
    from: `"Bravos Box - Sistema" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    replyTo: correo,
    subject: `[Arrepentimiento] ${codigo} — ${nombre}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <p style="font-size: 14px; color: #333;">Se recibió una solicitud por el botón de arrepentimiento. Hay que responderla y, si corresponde, reintegrar el pago.</p>
        ${tabla}
      </div>`,
  };

  for (const mail of [alCliente, alBox]) {
    try {
      await transporter.sendMail(mail);
    } catch (error) {
      console.error(`[Email Error] Arrepentimiento ${codigo}:`, error.message);
    }
  }
};

/**
 * Aviso de que una membresía vigente vence en pocos días (mismo criterio que el panel).
 */
const sendMembresiaVenceEmail = async (email, nombre, { plan, fechaVencimiento, diasRestantes, creditosDisponibles }) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  // fechaVencimiento llega como 'YYYY-MM-DD': se arma a mediodía para no correr el día por la zona horaria
  const fecha = new Date(`${fechaVencimiento}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const cuando = diasRestantes <= 0 ? 'hoy' : diasRestantes === 1 ? 'mañana' : `en ${diasRestantes} días`;

  const mailOptions = {
    from: `"Bravos Box" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Tu membresía vence ${cuando} (${fecha})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0;">
        <div style="background: #111111; padding: 28px 32px; text-align: center;">
          <p style="color: #a3e635; font-size: 11px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 8px 0;">Bravos Box</p>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 1px;">Tu membresía vence ${cuando}</h1>
        </div>
        <div style="padding: 32px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px 0;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 20px 0;">
            Tu plan <strong style="color: #111;">${escapeHtml(plan || 'actual')}</strong> vence el <strong style="color: #111;">${fecha}</strong>.
            ${creditosDisponibles > 0 ? `Todavía te quedan <strong>${Number(creditosDisponibles)} crédito${Number(creditosDisponibles) !== 1 ? 's' : ''}</strong>: usalos antes de esa fecha, porque no se acumulan.` : ''}
          </p>
          <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px 0;">
            Renová tu membresía para seguir reservando clases sin cortes.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${frontendUrl}/alumno/creditos" style="background-color: #a3e635; color: #000; padding: 14px 40px; text-decoration: none; font-size: 14px; font-weight: 900; display: inline-block; text-transform: uppercase; letter-spacing: 1px;">
              Renovar membresía →
            </a>
          </div>
        </div>
        <div style="background: #f5f5f5; padding: 16px 32px; text-align: center;">
          <p style="font-size: 11px; color: #999; margin: 0;">Este correo fue generado automáticamente por Bravos Box. No respondas este mensaje.</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Aviso de vencimiento enviado a: ${email}`);
  } catch (error) {
    console.error(`[Email Error] Aviso de vencimiento a ${email}:`, error.message);
  }
};

module.exports = {
  sendMembresiaVenceEmail,
  sendArrepentimientoEmails,
  sendVerificationEmail,
  sendRecoveryEmail,
  sendClaseDisponibleEmail,
  sendMembresiaPorVencerEmail,
  sendPagoConfirmadoEmail,
};