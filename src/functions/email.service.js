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
const sendVerificationEmail = async (email, nombre, token) => {
  // Construir la URL de verificación usando la interfaz del frontend existente
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const urlVerificacion = `${frontendUrl}/verificar-cuenta/${token}`;

  const mailOptions = {
    from: `"Bravos Gym 🏋️‍♂️" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '¡Activa tu cuenta en Bravos Gym! 💪',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #111; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #111; text-align: center; text-transform: uppercase;">¡Bienvenido a Bravos Gym, ${nombre}!</h2>
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Gracias por sumarte a nuestra comunidad. Para activar por completo tu cuenta y empezar a gestionar tus rutinas y asistencias, haz clic en el siguiente enlace de activación:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${urlVerificacion}" style="background-color: #2e7d32; color: white; padding: 14px 35px; text-decoration: none; font-size: 18px; font-weight: bold; border-radius: 5px; display: inline-block; text-transform: uppercase; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            Activar Mi Cuenta
          </a>
        </div>
        <p style="font-size: 14px; color: #666; text-align: center;">
          Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
          <a href="${urlVerificacion}" style="color: #2e7d32; word-break: break-all;">${urlVerificacion}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">
          Este correo fue generado automáticamente por el sistema de Bravos Gym. Por favor, no lo respondas.
        </p>
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
 * Enviar código de recuperación de contraseña (6 dígitos)
 */
const sendRecoveryEmail = async (email, nombre, code) => {
  const mailOptions = {
    from: `"Bravos Gym 🏋️‍♂️" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Código de recuperación de contraseña - Bravos Gym',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #111; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #111; text-align: center;">Código de recuperación</h2>
        <p style="font-size: 16px; color: #333;">Hola ${nombre || ''},</p>
        <p style="font-size: 16px; color: #333;">Usa el siguiente código para recuperar tu contraseña. Es válido por 15 minutos:</p>
        <div style="text-align: center; margin: 20px 0; font-size: 22px; font-weight: bold;">${code}</div>
        <p style="font-size: 14px; color: #666;">Si no pediste recuperar la contraseña, ignora este correo.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email Real] Código de recuperación enviado a: ${email}`);
  } catch (error) {
    console.error('[Email Error] Falla en el envío SMTP (recovery):', error);
    throw new Error('No se pudo enviar el código de recuperación');
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

module.exports = {
  sendVerificationEmail,
  sendRecoveryEmail,
  sendClaseDisponibleEmail,
};