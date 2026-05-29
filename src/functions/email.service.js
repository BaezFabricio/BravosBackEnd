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

module.exports = {
  sendVerificationEmail,
  sendRecoveryEmail,
};