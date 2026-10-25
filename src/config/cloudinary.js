// src/config/cloudinary.js
// Las credenciales salen del entorno (.env, que no se versiona). Nunca se escriben en el código.
const cloudinary = require('cloudinary').v2;

for (const v of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  if (!process.env[v]) console.warn(`Falta ${v} en el entorno: las imágenes no se van a poder subir a Cloudinary.`);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
