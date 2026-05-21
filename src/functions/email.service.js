const nodemailer = require('nodemailer');

// Forzamos a este archivo a leer directamente el .env por si el pasamanos de config falla
require('dotenv').config(); 

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
  // Enlace que irá al frontend para procesar la verificación
  const urlVerificacion = `http://localhost:5173/verificar-cuenta/${token}`;

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

module.exports = {
  sendVerificationEmail
};